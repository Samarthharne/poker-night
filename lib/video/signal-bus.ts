import type { Room } from "@/types/room";
import { saveRoom } from "@/lib/store/rooms";

export type RtcSignal = {
  from: string;
  to: string;
  description?: { type: string; sdp?: string };
  candidate?: Record<string, unknown> | null;
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
    return;
  }
  const queue = store.queues.get(id) ?? [];
  queue.push(signal);
  if (queue.length > 80) queue.splice(0, queue.length - 80);
  store.queues.set(id, queue);
}

export function persistSignal(room: Room, signal: RtcSignal) {
  const now = Date.now();
  room.rtcSignals = [...(room.rtcSignals ?? []), { ...signal, at: now }]
    .filter((item) => now - (item.at ?? now) < 20_000)
    .slice(-160);
  saveRoom(room);
}

export function takePersistedSignals(room: Room, playerId: string) {
  const now = Date.now();
  const all = (room.rtcSignals ?? []).filter((item) => now - (item.at ?? now) < 20_000);
  const mine = all.filter((item) => item.to === playerId);
  const rest = all.filter((item) => item.to !== playerId);
  if (mine.length || rest.length !== (room.rtcSignals ?? []).length) {
    room.rtcSignals = rest;
    saveRoom(room);
  }
  return mine;
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
