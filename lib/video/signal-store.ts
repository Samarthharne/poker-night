import { seedBlobsFromRequest } from "@/lib/store/durable";
import type { RtcSignal } from "./signal-bus";

const STORE_NAME = "poker-rtc";

type Packet = RtcSignal & { at: number };

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

export async function appendRtcSignal(roomId: string, signal: RtcSignal, req?: Request) {
  const store = await openStore(req);
  if (!store) return false;
  const key = inboxKey(roomId, signal.to);
  const now = Date.now();
  const packet: Packet = { ...signal, at: now };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const current = (await store.get(key, { type: "json", consistency: "strong" })) as Packet[] | null;
      const next = [...(Array.isArray(current) ? current : []), packet]
        .filter((item) => now - (item.at ?? now) < 25_000)
        .slice(-120);
      await store.setJSON(key, next);
      return true;
    } catch {
      /* retry */
    }
  }
  return false;
}

export async function readRtcSignals(roomId: string, playerId: string, req?: Request) {
  const store = await openStore(req);
  if (!store) return [] as Packet[];
  try {
    const current = (await store.get(inboxKey(roomId, playerId), {
      type: "json",
      consistency: "strong",
    })) as Packet[] | null;
    const now = Date.now();
    return (Array.isArray(current) ? current : []).filter((item) => now - (item.at ?? now) < 25_000);
  } catch {
    return [];
  }
}

export function dedupeSignals(signals: RtcSignal[]) {
  const seen = new Set<string>();
  const unique: RtcSignal[] = [];
  for (const signal of signals) {
    const key = [
      signal.from,
      signal.to,
      signal.description?.type ?? "",
      signal.description?.sdp?.slice(0, 48) ?? "",
      (signal.candidate as { candidate?: string } | null)?.candidate ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(signal);
  }
  return unique;
}
