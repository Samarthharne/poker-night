import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { Room } from "@/types/room";

const STORE_NAME = "poker-rooms";
const filePath = path.join(process.cwd(), ".data", "rooms.json");
const PERSIST_MS = 4_000;

type Snapshot = { rooms: Room[] };

let queue: Promise<void> = Promise.resolve();
let pendingRooms: Room[] | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function serverlessRuntime() {
  return Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_BLOBS_CONTEXT ||
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

function snapshotPath() {
  return serverlessRuntime() ? path.join("/tmp", "poker-rooms.json") : filePath;
}

function withTimeout<T>(job: Promise<T>, ms = PERSIST_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Room save timed out.")), ms);
    job.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function seedBlobsFromRequest(req?: Request) {
  try {
    const { setEnvironmentContext } = await import("@netlify/blobs");
    const header =
      req?.headers.get("x-nf-blobs") ??
      req?.headers.get("x-netlify-blobs") ??
      req?.headers.get("x-nf-blob-context");
    const raw = header || process.env.NETLIFY_BLOBS_CONTEXT || "";
    if (!raw && !process.env.NETLIFY_SITE_ID) return;
    let parsed: {
      apiURL?: string;
      deployID?: string;
      edgeURL?: string;
      siteID?: string;
      token?: string;
      uncachedEdgeURL?: string;
    } | null = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        try {
          parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
        } catch {
          parsed = null;
        }
      }
    }
    const siteID = parsed?.siteID || process.env.NETLIFY_SITE_ID || process.env.SITE_ID || "";
    const token = parsed?.token || process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || "";
    if (!siteID || !token) return;
    setEnvironmentContext({
      apiURL: parsed?.apiURL,
      deployID: parsed?.deployID || process.env.DEPLOY_ID || "",
      edgeURL: parsed?.edgeURL,
      siteID,
      token,
      uncachedEdgeURL: parsed?.uncachedEdgeURL,
    });
  } catch {
    // Blobs stay on the automatic Netlify runtime context.
  }
}

function readFileSnapshot(): Room[] | null {
  try {
    const raw = readFileSync(snapshotPath(), "utf8");
    const parsed = JSON.parse(raw) as Snapshot;
    return Array.isArray(parsed.rooms) ? parsed.rooms : null;
  } catch {
    return null;
  }
}

function writeFileSnapshot(rooms: Room[]) {
  const target = snapshotPath();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify({ rooms }));
}

function queueFileWrite(rooms: Room[]) {
  pendingRooms = rooms;
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const next = pendingRooms;
    pendingRooms = null;
    if (!next) return;
    try {
      writeFileSnapshot(next);
    } catch {
      // Keep the table in memory if the disk write is busy.
    }
  }, 50);
}

async function openBlobStore() {
  const { getStore, getDeployStore } = await import("@netlify/blobs");
  try {
    return getStore(STORE_NAME);
  } catch {
    try {
      return getDeployStore(STORE_NAME);
    } catch {
      return null;
    }
  }
}

async function readBlobSnapshot(): Promise<Room[] | null> {
  try {
    const store = await openBlobStore();
    if (!store) return null;
    const parsed = await withTimeout(store.get("state", { type: "json" }));
    if (!parsed || typeof parsed !== "object") return null;
    const rooms = (parsed as Snapshot).rooms;
    return Array.isArray(rooms) ? rooms : null;
  } catch (error) {
    console.error("[poker-night] failed to read rooms", error);
    return null;
  }
}

async function writeBlobSnapshot(rooms: Room[]) {
  const store = await openBlobStore();
  if (!store) return false;
  await withTimeout(store.setJSON("state", { rooms }));
  return true;
}

function presenceOf(left?: Room["players"][number], right?: Room["players"][number]) {
  const recent =
    (right?.lastSeenAt ?? 0) >= (left?.lastSeenAt ?? 0) ? right ?? left : left ?? right;
  return recent;
}

function mergePlayers(preferred: Room["players"], other: Room["players"]) {
  const pref = new Map(preferred.map((player) => [player.id, player]));
  const alt = new Map(other.map((player) => [player.id, player]));
  const ids = new Set([...pref.keys(), ...alt.keys()]);
  const merged: Room["players"] = [];
  for (const id of ids) {
    const main = pref.get(id);
    const extra = alt.get(id);
    const present = presenceOf(main, extra);
    const base = main ?? extra;
    if (!base || base.removed) continue;
    merged.push({
      ...base,
      isConnected: present?.isConnected ?? base.isConnected,
      lastSeenAt: Math.max(main?.lastSeenAt ?? 0, extra?.lastSeenAt ?? 0),
      cameraEnabled: present?.cameraEnabled ?? base.cameraEnabled,
      microphoneEnabled: present?.microphoneEnabled ?? base.microphoneEnabled,
    });
  }
  return merged;
}

function gameRank(room: Room) {
  const phase = room.game?.phase ?? "";
  const hand = room.game?.handNumber ?? 0;
  const seq = room.game?.actionSeq ?? 0;
  if (room.status === "playing" || room.status === "paused") return 200_000 + hand * 1_000 + seq;
  if (phase && phase !== "waiting" && phase !== "complete") {
    return 200_000 + hand * 1_000 + seq;
  }
  if (room.status === "complete" || phase === "complete") return 50_000 + hand * 1_000 + seq;
  return seq;
}

function pickLive(left: Room, right: Room) {
  const newer = left.updatedAt >= right.updatedAt ? left : right;
  const older = newer === left ? right : left;
  if (
    newer.updatedAt >= older.updatedAt &&
    (newer.status === "lobby" || newer.status === "closed") &&
    !newer.game
  ) {
    return newer;
  }
  const leftRank = gameRank(left);
  const rightRank = gameRank(right);
  if (leftRank !== rightRank) return leftRank > rightRank ? left : right;
  return newer;
}

function statusFromGame(room: Room): Room["status"] {
  if (room.closedAt) return "closed";
  if (room.game?.paused) return "paused";
  if (room.status === "paused" && room.game) return "playing";
  return room.status;
}

export function mergeRoomPair(left: Room, right: Room): Room {
  const newer = left.updatedAt >= right.updatedAt ? left : right;
  const older = newer === left ? right : left;
  const live = pickLive(left, right);
  const other = live === left ? right : left;
  const status = statusFromGame({ ...live, game: live.game });
  return {
    ...newer,
    status,
    locked: status === "playing" || status === "paused" ? live.locked : newer.locked,
    game: live.game,
    turnSeconds: newer.turnSeconds || older.turnSeconds,
    players: mergePlayers(live.players, other.players),
    inviteHash: newer.inviteHash || older.inviteHash,
    inviteSealed: newer.inviteSealed || older.inviteSealed,
    inviteExpiresAt: newer.inviteExpiresAt ?? older.inviteExpiresAt,
    rtcSignals: [...(older.rtcSignals ?? []), ...(newer.rtcSignals ?? [])].slice(-160),
    messages: newer.messages.length >= older.messages.length ? newer.messages : older.messages,
  };
}

export function mergeRooms(remote: Room[], local: Room[]) {
  const map = new Map<string, Room>();
  for (const room of remote) map.set(room.id, room);
  for (const room of local) {
    const previous = map.get(room.id);
    map.set(room.id, previous ? mergeRoomPair(previous, room) : room);
  }
  return [...map.values()];
}

export async function loadDurableRooms(): Promise<Room[] | null> {
  return (await readBlobSnapshot()) ?? readFileSnapshot();
}

export async function saveDurableRooms(local: Room[]) {
  const remote = (await readBlobSnapshot()) ?? readFileSnapshot() ?? [];
  const merged = mergeRooms(remote, local);
  try {
    if (await writeBlobSnapshot(merged)) {
      try {
        writeFileSnapshot(merged);
      } catch {
        /* optional local copy */
      }
      return true;
    }
  } catch (error) {
    console.error("[poker-night] failed to write Netlify Blobs", error);
  }
  try {
    writeFileSnapshot(merged);
    return true;
  } catch (error) {
    console.error("[poker-night] failed to write local room snapshot", error);
    if (!serverlessRuntime()) queueFileWrite(merged);
    return !serverlessRuntime();
  }
}

export async function persistDurableRooms(local: Room[]) {
  const job = queue.then(async () => {
    await saveDurableRooms(local);
  });
  queue = job.catch(() => undefined);
  await job.catch((error) => {
    console.error("[poker-night] persist failed", error);
  });
}
