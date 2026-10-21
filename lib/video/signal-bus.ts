import type { Room } from "@/types/room";
import { saveRoom, saveRoomNow } from "@/lib/store/rooms";
import { RTC_MESSAGE_TTL_MS, isRtcMessageType, keepRtcSignals, samePlayerId, type RtcMessage } from "./rtc-protocol";
import type { PlayerRtcSignal } from "@/types/player";

export type RtcSignal = {
  from: string;
  to: string;
  description?: { type: string; sdp?: string };
  candidate?: RTCIceCandidateInit | null;
  at?: number;
};

type Waiter = (signal: RtcSignal) => void;

type Bus = {
  queues: Map<string, RtcSignal[]>;
  waiters: Map<string, Set<Waiter>>;
};

const globalBus = globalThis as typeof globalThis & { __pokerSignals?: Bus };

function bus(): Bus {
  if (!globalBus.__pokerSignals) {
    globalBus.__pokerSignals = { queues: new Map(), waiters: new Map() };
  }
  return globalBus.__pokerSignals;
}

function key(roomId: string, playerId: string) {
  return `${roomId}:${playerId}`;
}

export function publishSignal(roomId: string, signal: RtcSignal) {
  const id = key(roomId, signal.to);
  const store = bus();
  const listeners = store.waiters.get(id);
  if (listeners && listeners.size > 0) {
    for (const listener of listeners) listener(signal);
  }
  const queue = store.queues.get(id) ?? [];
  queue.push(signal);
  if (queue.length > 80) queue.splice(0, queue.length - 80);
  store.queues.set(id, queue);
}

export function persistSignal(room: Room, signal: RtcSignal) {
  const now = Date.now();
  const type: RtcMessage["type"] = signal.description?.type === "answer" ? "answer" : signal.description ? "offer" : "ice-candidate";
  room.rtcSignals = keepRtcSignals([
    ...(room.rtcSignals ?? []),
    {
      id: `legacy-${signal.from}-${signal.to}-${now}`,
      roomId: room.id,
      from: signal.from,
      to: signal.to,
      type,
      sessionId: "legacy",
      createdAt: now,
      at: now,
      payload: {
        sdp: signal.description,
        candidate: signal.candidate ?? null,
      },
    },
  ], now);
  if (signal.description) saveRoom(room);
}

export async function persistRtcMessage(room: Room, message: RtcMessage, flush = false) {
  const now = Date.now();
  room.rtcSignals = keepRtcSignals([
    ...(room.rtcSignals ?? []),
    {
      ...message,
      roomId: room.id,
      at: now,
    },
  ], now);
  if (
    (message.type === "offer" || message.type === "answer" || message.type === "ice-restart") &&
    message.payload.sdp?.sdp
  ) {
    const sender = room.players.find((player) => samePlayerId(player.id, message.from));
    if (sender) {
      const signal: PlayerRtcSignal = {
        id: message.id,
        type: message.type,
        to: message.to,
        sessionId: message.sessionId,
        sdp: message.payload.sdp.sdp,
        sdpType: message.payload.sdp.type || message.type,
        at: now,
      };
      sender.rtcSignal = signal;
    }
  }
  if (flush) await saveRoomNow(room);
  else saveRoom(room);
}

export function takePersistedRtcMessages(room: Room, playerId: string): RtcMessage[] {
  const now = Date.now();
  const all = (room.rtcSignals ?? []).filter((item) => now - (item.createdAt ?? item.at) < RTC_MESSAGE_TTL_MS);
  if (all.length !== (room.rtcSignals ?? []).length) {
    room.rtcSignals = all;
    saveRoom(room);
  }
  return all
    .filter((item) => samePlayerId(item.to, playerId) && isRtcMessageType(item.type))
    .map((item) => ({
      id: item.id,
      roomId: room.id,
      from: item.from,
      to: item.to,
      type: item.type,
      sessionId: item.sessionId,
      createdAt: item.createdAt ?? item.at,
      payload: {
        sdp: item.payload?.sdp ?? item.description,
        candidate: item.payload?.candidate ?? item.candidate ?? null,
      },
    }));
}

export function ackRoomRtcMessages(room: Room, playerId: string, ids: string[]) {
  if (!ids.length) return;
  const drop = new Set(ids);
  const next = (room.rtcSignals ?? []).filter((item) => !samePlayerId(item.to, playerId) || !drop.has(item.id));
  if (next.length === (room.rtcSignals ?? []).length) return;
  room.rtcSignals = next;
  saveRoom(room);
}

export function takePersistedSignals(room: Room, playerId: string) {
  return takePersistedRtcMessages(room, playerId);
}

export function subscribeSignals(roomId: string, playerId: string, listener: Waiter) {
  const id = key(roomId, playerId);
  const store = bus();
  const queued = store.queues.get(id) ?? [];
  store.queues.set(id, []);
  for (const signal of queued) listener(signal);
  if (!store.waiters.has(id)) store.waiters.set(id, new Set());
  store.waiters.get(id)!.add(listener);
  return () => {
    store.waiters.get(id)?.delete(listener);
  };
}
