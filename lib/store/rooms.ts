import { customAlphabet } from "nanoid";
import { after } from "next/server";
import { hashInviteToken } from "@/lib/admin/crypto";
import type { Room } from "@/types/room";
import type { Player } from "@/types/player";
import { toSnapshot } from "@/lib/poker/public-state";
import { legalActions } from "@/lib/poker/betting";
import {
  applyAction,
  autoAct,
  continueAfterShowdown,
  playerAtSeat,
  SHOWDOWN_HOLD_MS,
} from "@/lib/poker/game-engine";
import {
  loadDurableRooms,
  mergeRooms,
  persistDurableRooms,
  saveDurableRooms,
  seedBlobsFromRequest,
} from "@/lib/store/durable";

const roomCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const idNano = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 16);

type Listener = (room: Room) => void;

type Store = {
  rooms: Map<string, Room>;
  byId: Map<string, Room>;
  invites: Map<string, string>;
  listeners: Map<string, Set<Listener>>;
  timers: Map<string, ReturnType<typeof setInterval>>;
};

const globalStore = globalThis as typeof globalThis & {
  __pokerNight?: Store;
  __pokerNightHydrated?: boolean;
};

function getStore(): Store {
  if (!globalStore.__pokerNight) {
    globalStore.__pokerNight = {
      rooms: new Map(),
      byId: new Map(),
      invites: new Map(),
      listeners: new Map(),
      timers: new Map(),
    };
  }
  if (!globalStore.__pokerNight.byId) globalStore.__pokerNight.byId = new Map();
  if (!globalStore.__pokerNight.invites) globalStore.__pokerNight.invites = new Map();
  return globalStore.__pokerNight;
}

export function newId() {
  return idNano();
}

export function newRoomCode() {
  return roomCode();
}

export function getRoomByCode(code: string) {
  const normalized = code.trim().toUpperCase();
  return getStore().rooms.get(normalized) ?? null;
}

export function getRoomById(id: string) {
  return getStore().byId.get(id) ?? null;
}

export function listRooms() {
  return [...getStore().byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function getRoomByInviteToken(token: string) {
  const id = getStore().invites.get(hashInviteToken(token));
  if (!id) return null;
  return getStore().byId.get(id) ?? null;
}

export function rememberInvite(room: Room, hash: string) {
  getStore().invites.set(hash, room.id);
}

function indexRoom(room: Room) {
  const store = getStore();
  store.rooms.set(room.roomCode, room);
  store.byId.set(room.id, room);
  if (room.inviteHash) store.invites.set(room.inviteHash, room.id);
}

function replaceRooms(rooms: Room[]) {
  const store = getStore();
  store.rooms.clear();
  store.byId.clear();
  store.invites.clear();
  for (const room of rooms) indexRoom(room);
}

export async function ensureStore(req?: Request) {
  await seedBlobsFromRequest(req);
  const onNetlify = process.env.NETLIFY === "true" || Boolean(process.env.NETLIFY_BLOBS_CONTEXT);
  if (!globalStore.__pokerNightHydrated || onNetlify) {
    const rooms = await loadDurableRooms();
    if (rooms) replaceRooms(mergeRooms(rooms, listRooms()));
    globalStore.__pokerNightHydrated = true;
  }
  let changed = false;
  for (const room of listRooms()) {
    if (advanceRoom(room)) {
      room.updatedAt = Date.now();
      changed = true;
    }
  }
  if (changed) await saveDurableRooms(listRooms());
}

function serverlessRuntime() {
  return Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_BLOBS_CONTEXT ||
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

export function saveRoom(room: Room) {
  room.updatedAt = Date.now();
  indexRoom(room);
  ensureTimer(room.roomCode);
  emit(room);
  const job = saveDurableRooms(listRooms()).catch((error) => {
    console.error("[poker-night] failed to persist rooms", error);
  });
  if (serverlessRuntime()) {
    void job;
    return;
  }
  try {
    after(() => job);
  } catch {
    void job;
  }
}

export async function persistRooms() {
  await persistDurableRooms(listRooms());
}

export async function saveRoomNow(room: Room) {
  saveRoom(room);
  await persistRooms();
}

export function subscribe(code: string, listener: Listener) {
  const store = getStore();
  const key = code.toUpperCase();
  if (!store.listeners.has(key)) store.listeners.set(key, new Set());
  store.listeners.get(key)!.add(listener);
  return () => {
    store.listeners.get(key)?.delete(listener);
  };
}

export function emit(room: Room) {
  const listeners = getStore().listeners.get(room.roomCode);
  if (!listeners) return;
  for (const listener of listeners) listener(room);
}

export function findPlayerByToken(room: Room, token: string | null) {
  if (!token) return null;
  return room.players.find((p) => p.token === token) ?? null;
}

export function findPlayerBySession(room: Room, sessionId: string) {
  return room.players.find((p) => p.sessionId === sessionId) ?? null;
}

export function snapshotFor(room: Room, token: string | null) {
  const player = findPlayerByToken(room, token);
  if (player?.removed) return toSnapshot(room, null, { includeDeck: false });
  return toSnapshot(room, player?.id ?? null, { includeDeck: false });
}

export function markDisconnected(room: Room, player: Player) {
  player.isConnected = false;
  player.lastSeenAt = Date.now();
  saveRoom(room);
}

export function heartbeat(room: Room, player: Player) {
  player.isConnected = true;
  player.lastSeenAt = Date.now();
}

export function advanceRoom(room: Room) {
  let changed = false;
  if (room.status === "playing" && room.game && !room.game.paused) {
    try {
      if (room.game.phase === "showdown") {
        if (Date.now() - room.game.turnStartedAt >= SHOWDOWN_HOLD_MS) {
          continueAfterShowdown(room);
          changed = true;
        }
      } else if (room.game.currentSeat != null) {
        const actor = playerAtSeat(room, room.game.currentSeat);
        const before = room.game.turnStartedAt;
        const phaseBefore = room.game.phase;
        if (actor?.token.startsWith("bot-") && Date.now() - room.game.turnStartedAt > 1100) {
          const legal = legalActions(room.game, actor);
          const preferred =
            legal.find((a) => a.type === "check") ??
            legal.find((a) => a.type === "call") ??
            legal.find((a) => a.type === "fold");
          if (preferred) {
            applyAction(room, actor.id, preferred.type, preferred.amount);
            if (String(room.game.phase) === "showdown") room.game.turnStartedAt = Date.now();
            changed = true;
          }
        } else {
          autoAct(room);
          if (room.game.turnStartedAt !== before || room.game.phase !== phaseBefore) {
            if (String(room.game.phase) === "showdown") room.game.turnStartedAt = Date.now();
            changed = true;
          }
        }
      }
    } catch {
      // keep the table available
    }
  }
  const stale = Date.now() - 90_000;
  for (const p of room.players) {
    if (p.token.startsWith("bot-")) continue;
    if (p.isConnected && p.lastSeenAt < stale) {
      p.isConnected = false;
      changed = true;
    }
  }
  return changed;
}

function ensureTimer(code: string) {
  if (serverlessRuntime()) return;
  const store = getStore();
  if (store.timers.has(code)) return;
  const timer = setInterval(() => {
    const room = getRoomByCode(code);
    if (!room) return;
    if (advanceRoom(room)) saveRoom(room);
  }, 500);
  store.timers.set(code, timer);
}

export function createEmptyRoom(input: {
  name: string;
  maxPlayers: number;
  startingChips: number;
  smallBlind: number;
  turnSeconds?: number;
}): Room {
  const code = newRoomCode();
  return {
    id: newId(),
    roomCode: code,
    name: input.name,
    hostId: "",
    maxPlayers: input.maxPlayers,
    startingChips: input.startingChips,
    smallBlind: input.smallBlind,
    bigBlind: input.smallBlind * 2,
    turnSeconds: input.turnSeconds && input.turnSeconds >= 10 ? Math.round(input.turnSeconds) : 30,
    status: "lobby",
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: null,
    closedAt: null,
    inviteHash: "",
    inviteSealed: "",
    inviteExpiresAt: null,
    players: [],
    game: null,
    messages: [],
    handHistory: [],
    rtcSignals: [],
  };
}
