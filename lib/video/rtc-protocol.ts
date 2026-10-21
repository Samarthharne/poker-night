export const RTC_MESSAGE_TYPES = [
  "offer",
  "answer",
  "ice-candidate",
  "renegotiate",
  "ice-restart",
  "hangup",
  "ack",
] as const;

export type RtcMessageType = (typeof RTC_MESSAGE_TYPES)[number];

export type RtcMessage = {
  id: string;
  roomId: string;
  from: string;
  to: string;
  type: RtcMessageType;
  sessionId: string;
  createdAt: number;
  payload: {
    sdp?: { type: string; sdp?: string };
    candidate?: RTCIceCandidateInit | null;
  };
};

export const RTC_MESSAGE_TTL_MS = 20_000;

export function normalizePlayerId(id: string) {
  return id.replace(/-/g, "").toLowerCase();
}

export function isOfferer(selfId: string, peerId: string) {
  return normalizePlayerId(selfId) < normalizePlayerId(peerId);
}

export function pairSessionId(selfId: string, peerId: string) {
  const [left, right] = [normalizePlayerId(selfId), normalizePlayerId(peerId)].sort();
  return `${left}:${right}`;
}

export function isRtcMessageType(value: unknown): value is RtcMessageType {
  return typeof value === "string" && (RTC_MESSAGE_TYPES as readonly string[]).includes(value);
}

export function isExpiredMessage(message: { createdAt: number }, now = Date.now()) {
  return now - message.createdAt > RTC_MESSAGE_TTL_MS;
}

export function isStaleSession(currentSessionId: string | undefined, messageSessionId: string) {
  if (!currentSessionId || messageSessionId === "legacy") return false;
  return currentSessionId !== messageSessionId;
}

export function nextRetryDelay(attempt: number, random = Math.random()) {
  const capped = Math.min(8, Math.max(0, attempt));
  const base = 700 * 2 ** capped;
  return Math.min(16_000, Math.round(base + random * 400));
}

export function parseRtcMessage(input: unknown, fallback: { roomId: string; from: string }): RtcMessage | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  const to = typeof body.to === "string" ? body.to : "";
  if (!to || to === fallback.from) return null;

  if (isRtcMessageType(body.type) && typeof body.id === "string" && typeof body.sessionId === "string") {
    const createdAt = typeof body.createdAt === "number" ? body.createdAt : Date.now();
    const payload = (body.payload ?? {}) as RtcMessage["payload"];
    const roomId = typeof body.roomId === "string" && body.roomId ? body.roomId : fallback.roomId;
    return {
      id: body.id,
      roomId,
      from: fallback.from,
      to,
      type: body.type,
      sessionId: body.sessionId,
      createdAt,
      payload: {
        sdp: payload.sdp,
        candidate: payload.candidate ?? null,
      },
    };
  }

  const description = body.description as { type?: string; sdp?: string } | undefined;
  const candidate = (body.candidate as RTCIceCandidateInit | null | undefined) ?? null;
  if (description?.type === "offer" || description?.type === "answer") {
    return {
      id: `legacy-${fallback.from}-${to}-${description.type}-${Date.now()}`,
      roomId: fallback.roomId,
      from: fallback.from,
      to,
      type: description.type,
      sessionId: "legacy",
      createdAt: Date.now(),
      payload: { sdp: { type: description.type, sdp: description.sdp } },
    };
  }
  if (candidate) {
    return {
      id: `legacy-${fallback.from}-${to}-ice-${Date.now()}`,
      roomId: fallback.roomId,
      from: fallback.from,
      to,
      type: "ice-candidate",
      sessionId: "legacy",
      createdAt: Date.now(),
      payload: { candidate },
    };
  }
  return null;
}

export function createRtcMessage(input: {
  roomId: string;
  from: string;
  to: string;
  type: RtcMessageType;
  sessionId: string;
  payload?: RtcMessage["payload"];
}): RtcMessage {
  return {
    id: crypto.randomUUID(),
    roomId: input.roomId,
    from: input.from,
    to: input.to,
    type: input.type,
    sessionId: input.sessionId,
    createdAt: Date.now(),
    payload: input.payload ?? {},
  };
}

export function queueIceCandidate(
  queued: RTCIceCandidateInit[],
  candidate: RTCIceCandidateInit | null,
  remoteReady: boolean,
) {
  if (!candidate || !candidate.candidate) {
    return { queued, apply: remoteReady ? [null] : queued };
  }
  if (!remoteReady) return { queued: [...queued, candidate], apply: [] as RTCIceCandidateInit[] };
  return { queued, apply: [candidate] };
}

export function isRtcMessage(value: unknown): value is RtcMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as RtcMessage;
  return (
    typeof item.id === "string" &&
    isRtcMessageType(item.type) &&
    typeof item.from === "string" &&
    typeof item.to === "string" &&
    typeof item.sessionId === "string" &&
    typeof item.createdAt === "number"
  );
}

export function mergeRtcMessages(left?: unknown, right?: unknown, now = Date.now()) {
  const map = new Map<string, RtcMessage>();
  for (const item of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) {
    if (!isRtcMessage(item) || isExpiredMessage(item, now)) continue;
    map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-160);
}

export function signalingAllowed(input: {
  senderId: string;
  targetId: string;
  memberIds: string[];
  roomId: string;
  messageRoomId: string;
}) {
  if (input.messageRoomId !== input.roomId) return false;
  if (input.senderId === input.targetId) return false;
  return input.memberIds.includes(input.senderId) && input.memberIds.includes(input.targetId);
}
