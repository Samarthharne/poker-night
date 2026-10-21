import { seedBlobsFromRequest } from "@/lib/store/durable";
import { RTC_MESSAGE_TTL_MS, type RtcMessage } from "./rtc-protocol";

const STORE_NAME = "poker-rtc";

const memory = new Map<string, RtcMessage[]>();

async function openStore(req?: Request) {
  await seedBlobsFromRequest(req);
  try {
    const { getStore, getDeployStore } = await import("@netlify/blobs");
    try {
      return getStore(STORE_NAME);
    } catch {
      return getDeployStore(STORE_NAME);
    }
  } catch {
    return null;
  }
}

function inboxKey(roomId: string, playerId: string) {
  return `inbox:${roomId}:${playerId}`;
}

function prune(messages: RtcMessage[], now = Date.now()) {
  const seen = new Set<string>();
  return messages
    .filter((item) => now - item.createdAt < RTC_MESSAGE_TTL_MS)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(-160);
}

async function readInbox(roomId: string, playerId: string, req?: Request) {
  const key = inboxKey(roomId, playerId);
  const store = await openStore(req);
  if (!store) return prune(memory.get(key) ?? []);
  try {
    const current = (await store.get(key, { type: "json", consistency: "strong" })) as RtcMessage[] | null;
    return prune(Array.isArray(current) ? current : []);
  } catch {
    return [];
  }
}

async function writeInbox(roomId: string, playerId: string, messages: RtcMessage[], req?: Request) {
  const key = inboxKey(roomId, playerId);
  const next = prune(messages);
  const store = await openStore(req);
  if (!store) {
    memory.set(key, next);
    return true;
  }
  await store.setJSON(key, next);
  return true;
}

export async function appendRtcMessage(roomId: string, message: RtcMessage, req?: Request) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const current = await readInbox(roomId, message.to, req);
      await writeInbox(roomId, message.to, [...current, message], req);
      return true;
    } catch {
      /* retry */
    }
  }
  return false;
}

export async function readRtcMessages(roomId: string, playerId: string, req?: Request) {
  return readInbox(roomId, playerId, req);
}

export async function ackRtcMessages(roomId: string, playerId: string, ids: string[], req?: Request) {
  const drop = new Set(ids);
  const current = await readInbox(roomId, playerId, req);
  await writeInbox(
    roomId,
    playerId,
    current.filter((item) => !drop.has(item.id)),
    req,
  );
}
