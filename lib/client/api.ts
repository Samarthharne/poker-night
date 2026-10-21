import type { PokerActionType } from "@/types/poker";
import type { RoomSnapshot } from "@/types/room";
import { getRoomToken, getSessionId, setRoomToken } from "./session";

async function parse(res: Response) {
  const data = (await res.json()) as {
    error?: string;
    snapshot?: RoomSnapshot;
    token?: string;
    sessionId?: string;
    preview?: { name: string; players: number; maxPlayers: number; canJoin: boolean };
  };
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function authHeaders(code: string): HeadersInit {
  const token = getRoomToken(code);
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function createRoom(input: {
  name: string;
  hostName: string;
  startingChips: number;
  smallBlind: number;
  maxPlayers: number;
  sessionId?: string;
}) {
  const res = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, sessionId: getSessionId() }),
  });
  const data = await parse(res);
  if (data.token && data.snapshot) {
    setRoomToken(data.snapshot.roomCode, data.token);
  }
  return data;
}

export async function fetchRoom(code: string) {
  const token = getRoomToken(code);
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  const res = await fetch(`/api/rooms/${code}${qs}`, { cache: "no-store" });
  return parse(res);
}

export async function heartbeatRoom(code: string) {
  const res = await fetch(`/api/rooms/${code}/heartbeat`, {
    method: "POST",
    headers: authHeaders(code),
    body: JSON.stringify({}),
  });
  return parse(res);
}

export async function joinRoom(
  code: string,
  input: {
    displayName: string;
    cameraEnabled?: boolean;
    microphoneEnabled?: boolean;
    sessionId?: string;
  },
) {
  const res = await fetch(`/api/rooms/${code}/join`, {
    method: "POST",
    headers: authHeaders(code),
    body: JSON.stringify({ ...input, sessionId: getSessionId() }),
  });
  const data = await parse(res);
  if (data.token) {
    setRoomToken(code, data.token);
    if (data.snapshot?.roomCode) setRoomToken(data.snapshot.roomCode, data.token);
  }
  return data;
}

export async function leaveRoom(code: string) {
  const res = await fetch(`/api/rooms/${code}/leave`, {
    method: "POST",
    headers: authHeaders(code),
    body: JSON.stringify({}),
  });
  return parse(res);
}

export async function sendAction(
  code: string,
  type: PokerActionType,
  amount?: number,
) {
  const res = await fetch(`/api/rooms/${code}/action`, {
    method: "POST",
    headers: authHeaders(code),
    body: JSON.stringify({ type, amount }),
  });
  return parse(res);
}

export async function sendHost(code: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/rooms/${code}/host`, {
    method: "POST",
    headers: authHeaders(code),
    body: JSON.stringify(body),
  });
  return parse(res);
}

export async function sendChat(code: string, message: string) {
  const res = await fetch(`/api/rooms/${code}/chat`, {
    method: "POST",
    headers: authHeaders(code),
    body: JSON.stringify({ message }),
  });
  return parse(res);
}

export async function sendMedia(
  code: string,
  body: { cameraEnabled?: boolean; microphoneEnabled?: boolean; ready?: boolean },
) {
  const res = await fetch(`/api/rooms/${code}/media`, {
    method: "POST",
    headers: authHeaders(code),
    body: JSON.stringify(body),
  });
  return parse(res);
}

export async function sendRtcSignal(code: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`/api/rooms/${code}/signals`, {
      method: "POST",
      headers: authHeaders(code),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    return res.json().catch(() => ({ ok: false }));
  } catch {
    return { ok: false, error: "Signal post timed out." };
  }
}

export async function fetchRtcSignals(code: string) {
  const token = getRoomToken(code);
  const qs = new URLSearchParams();
  if (token) qs.set("token", token);
  const res = await fetch(`/api/rooms/${code}/signals?${qs.toString()}`, {
    headers: authHeaders(code),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as { messages?: unknown; signals?: unknown } | null;
  if (Array.isArray(data?.messages)) return data.messages;
  return Array.isArray(data?.signals) ? data.signals : [];
}

export async function fetchRtcIce(code: string) {
  const token = getRoomToken(code);
  const qs = new URLSearchParams({ code });
  if (token) qs.set("token", token);
  const res = await fetch(`/api/webrtc/ice-servers?${qs.toString()}`, {
    headers: authHeaders(code),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as {
    iceServers?: RTCIceServer[];
    turnConfigured?: boolean;
    warning?: string | null;
    channel?: string;
    roomId?: string;
    ttlSeconds?: number;
    expiresAt?: number;
  } | null;
}

export function eventsUrl(code: string) {
  const token = getRoomToken(code);
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return `/api/rooms/${code}/events${qs}`;
}
