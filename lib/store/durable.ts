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

async function readBlobSnapshot(): Promise<{ rooms: Room[] | null; failed: boolean }> {
  try {
    const store = await openBlobStore();
    if (!store) return { rooms: null, failed: false };
    const parsed = await withTimeout(store.get("state", { type: "json" }));
    if (!parsed || typeof parsed !== "object") return { rooms: [], failed: false };
    const rooms = (parsed as Snapshot).rooms;
    return { rooms: Array.isArray(rooms) ? rooms : [], failed: false };
  } catch (error) {
    console.error("[poker-night] failed to read rooms", error);
    return { rooms: null, failed: true };
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

const PHASE_RANK: Record<string, number> = {
  waiting: 0,
  preflop: 1,
  flop: 2,
  turn: 3,
  river: 4,
  showdown: 5,
  complete: 6,
};

function gameRank(room: Room) {
  const phase = room.game?.phase ?? "";
  const hand = room.game?.handNumber ?? 0;
  const seq = room.game?.actionSeq ?? 0;
  const board = room.game?.communityCards.length ?? 0;
  const street = PHASE_RANK[phase] ?? 0;
  if (room.status === "playing" || room.status === "paused") {
    return 200_000_000 + hand * 100_000 + street * 1_000 + board * 50 + seq;
  }
  if (street > 0 && phase !== "complete") {
    return 200_000_000 + hand * 100_000 + street * 1_000 + board * 50 + seq;
  }
  if (room.status === "complete" || phase === "complete") {
    return 50_000_000 + hand * 100_000 + seq;
  }
  return seq;
}

function isIdle(room: Room) {
  return !room.game || room.status === "lobby" || room.status === "closed";
}

function pickLive(left: Room, right: Room) {
  const leftGen = left.generation ?? 0;
  const rightGen = right.generation ?? 0;
  if (leftGen !== rightGen) return leftGen > rightGen ? left : right;
  const newer = left.updatedAt >= right.updatedAt ? left : right;
  const older = newer === left ? right : left;
  const newerIdle = isIdle(newer);
  const olderIdle = isIdle(older);
  if (newerIdle !== olderIdle) return newerIdle ? newer : older;
  if (newerIdle && olderIdle) return newer;
  const leftRank = gameRank(left);
  const rightRank = gameRank(right);
  if (leftRank !== rightRank) return leftRank > rightRank ? left : right;
  return newer;
}

function statusFromGame(room: Room): Room["status"] {
  if (room.closedAt) return "closed";
  if (!room.game) return "lobby";
  if (room.game.paused) return "paused";
  if (room.game.phase === "complete") return "complete";
  return "playing";
}

function liveEqual(left: Room[], right: Room[]) {
  if (left.length !== right.length) return false;
  const map = new Map(right.map((room) => [room.id, room]));
  for (const room of left) {
    const other = map.get(room.id);
    if (!other) return false;
    if ((room.generation ?? 0) !== (other.generation ?? 0)) return false;
    if (room.status !== other.status) return false;
    if (Boolean(room.game) !== Boolean(other.game)) return false;
    if ((room.game?.handNumber ?? 0) !== (other.game?.handNumber ?? 0)) return false;
    if (room.game?.phase !== other.game?.phase) return false;
    if ((room.game?.communityCards.length ?? 0) !== (other.game?.communityCards.length ?? 0)) return false;
    if ((room.game?.actionSeq ?? 0) !== (other.game?.actionSeq ?? 0)) return false;
  }
  return true;
}

function mergeRtcSignals(
  left: Room["rtcSignals"] = [],
  right: Room["rtcSignals"] = [],
): NonNullable<Room["rtcSignals"]> {
  const now = Date.now();
  const map = new Map<string, NonNullable<Room["rtcSignals"]>[number]>();
  for (const item of [...(left ?? []), ...(right ?? [])]) {
    const created = item.createdAt ?? item.at ?? 0;
    if (now - created > 20_000) continue;
    const id = item.id || `${item.from}:${item.to}:${created}:${item.type || "legacy"}`;
    map.set(id, { ...item, id, createdAt: created, at: item.at ?? created });
  }
  return [...map.values()].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)).slice(-160);
}

export function mergeRoomPair(left: Room, right: Room): Room {
  const live = pickLive(left, right);
  const other = live === left ? right : left;
  const generation = Math.max(left.generation ?? 0, right.generation ?? 0);
  const idle = !live.game || live.status === "lobby" || live.status === "closed";
  const players = mergePlayers(live.players, idle ? live.players : other.players).map((player) =>
    idle
      ? {
          ...player,
          folded: false,
          allIn: false,
          currentBet: 0,
          totalBetThisHand: 0,
          contributedThisHand: 0,
          holeCards: undefined,
          hasActedThisRound: false,
        }
      : player,
  );
  if (idle) {
    return {
      ...live,
      generation,
      updatedAt: Math.max(left.updatedAt, right.updatedAt),
      status: live.closedAt ? "closed" : "lobby",
      locked: false,
      game: null,
      players,
      rtcSignals: mergeRtcSignals(other.rtcSignals, live.rtcSignals),
      messages: live.messages.length >= other.messages.length ? live.messages : other.messages,
    };
  }
  const status = statusFromGame(live);
  return {
    ...live,
    generation,
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
    status,
    locked: status === "playing" || status === "paused" ? live.locked : live.locked,
    game: live.game,
    turnSeconds: live.turnSeconds || other.turnSeconds,
    players,
    inviteHash: live.inviteHash || other.inviteHash,
    inviteSealed: live.inviteSealed || other.inviteSealed,
    inviteExpiresAt: live.inviteExpiresAt ?? other.inviteExpiresAt,
    rtcSignals: mergeRtcSignals(other.rtcSignals, live.rtcSignals),
    messages: live.messages.length >= other.messages.length ? live.messages : other.messages,
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
  const blob = await readBlobSnapshot();
  if (blob.failed) return serverlessRuntime() ? null : readFileSnapshot();
  if (blob.rooms) return blob.rooms;
  return serverlessRuntime() ? [] : readFileSnapshot();
}

export async function saveDurableRooms(local: Room[]) {
  let incoming = local;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const blob = await readBlobSnapshot();
    if (blob.failed) {
      console.error("[poker-night] blob read failed, retrying persist");
      continue;
    }
    const remote = blob.rooms ?? (serverlessRuntime() ? [] : readFileSnapshot() ?? []);
    const merged = mergeRooms(remote, incoming);
    try {
      if (await writeBlobSnapshot(merged)) {
        const verify = await readBlobSnapshot();
        if (!verify.failed && verify.rooms) {
          const confirmed = mergeRooms(verify.rooms, merged);
          if (!liveEqual(confirmed, merged)) {
            incoming = confirmed;
            continue;
          }
        }
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
  try {
    if (await writeBlobSnapshot(incoming)) return true;
  } catch (error) {
    console.error("[poker-night] failed to write Netlify Blobs", error);
  }
  return false;
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
