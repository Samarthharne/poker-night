import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { Room } from "@/types/room";

const filePath = path.join(process.cwd(), ".data", "rooms.json");

type Snapshot = { rooms: Room[] };

let queue: Promise<void> = Promise.resolve();

function blobEnabled() {
  return process.env.NETLIFY === "true" || Boolean(process.env.NETLIFY_BLOBS_CONTEXT);
}

function readFileSnapshot(): Room[] | null {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Snapshot;
    return Array.isArray(parsed.rooms) ? parsed.rooms : null;
  } catch {
    return null;
  }
}

function writeFileSnapshot(rooms: Room[]) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify({ rooms }));
}

async function blobs() {
  const { getStore } = await import("@netlify/blobs");
  return getStore("poker-rooms");
}

async function readBlobSnapshot(): Promise<Room[] | null> {
  try {
    const store = await blobs();
    const parsed = await store.get("state", { type: "json", consistency: "strong" });
    if (!parsed || typeof parsed !== "object") return null;
    const rooms = (parsed as Snapshot).rooms;
    return Array.isArray(rooms) ? rooms : null;
  } catch {
    return null;
  }
}

export function mergeRooms(remote: Room[], local: Room[]) {
  const map = new Map<string, Room>();
  for (const room of remote) map.set(room.id, room);
  for (const room of local) {
    const previous = map.get(room.id);
    if (!previous || room.updatedAt >= previous.updatedAt) map.set(room.id, room);
  }
  return [...map.values()];
}

export async function loadDurableRooms(): Promise<Room[] | null> {
  if (blobEnabled()) {
    const remote = await readBlobSnapshot();
    if (remote) return remote;
  }
  return readFileSnapshot();
}

let pendingRooms: Room[] | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

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
      // The table stays in memory if the disk write is busy.
    }
  }, 300);
}

export async function saveDurableRooms(local: Room[]) {
  if (!blobEnabled()) {
    queueFileWrite(local);
    return;
  }
  const job = queue.then(async () => {
    const remote = (await readBlobSnapshot()) ?? [];
    const merged = mergeRooms(remote, local);
    const store = await blobs();
    await store.setJSON("state", { rooms: merged });
  });
  queue = job.catch(() => undefined);
  await job;
}
