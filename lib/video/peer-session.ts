import {
  isOfferer,
  isExpiredMessage,
  isStaleSession,
  type RtcMessage,
} from "./rtc-protocol";

export type PeerDiagnostics = {
  playerId: string;
  sessionId: string;
  polite: boolean;
  offerer: boolean;
  connectionState: string;
  iceConnectionState: string;
  iceGatheringState: string;
  signalingState: string;
  localAudio: boolean;
  localVideo: boolean;
  remoteAudio: boolean;
  remoteVideo: boolean;
  videoFrame: boolean;
  candidateType: "host" | "srflx" | "relay" | "unknown";
  transport: "udp" | "tcp" | "unknown";
  lastError: string | null;
  lastAttemptAt: number;
  retryAttempt: number;
};

type CandidatePair = { type?: string } | undefined;

export function candidatePairType(stat: CandidatePair): PeerDiagnostics["candidateType"] {
  if (stat?.type === "host" || stat?.type === "srflx" || stat?.type === "relay") return stat.type;
  return "unknown";
}

export function canApplyMessage(
  currentSessionId: string | undefined,
  message: RtcMessage,
  seenIds: Set<string>,
  now = Date.now(),
) {
  if (seenIds.has(message.id)) return { ok: false as const, reason: "duplicate" };
  if (isExpiredMessage(message, now)) return { ok: false as const, reason: "expired" };
  if (message.type !== "hangup" && isStaleSession(currentSessionId, message.sessionId)) {
    if (message.type === "offer") return { ok: true as const, reason: "new-session" };
    return { ok: false as const, reason: "stale-session" };
  }
  return { ok: true as const, reason: "apply" };
}

export function glareDecision(input: {
  selfId: string;
  peerId: string;
  makingOffer: boolean;
  signalingState: string;
  incomingType: RtcMessage["type"];
}) {
  if (input.incomingType !== "offer") return { ignore: false, rollback: false };
  const colliding = input.makingOffer || input.signalingState !== "stable";
  if (!colliding) return { ignore: false, rollback: false };
  const polite = !isOfferer(input.selfId, input.peerId);
  if (!polite) return { ignore: true, rollback: false };
  return { ignore: false, rollback: true };
}

export function shouldOffer(selfId: string, peerId: string) {
  return isOfferer(selfId, peerId);
}

export function shouldPollOffer(input: {
  connectionState: string;
  iceConnectionState: string;
  signalingState: string;
  hasRemoteDescription: boolean;
}) {
  if (input.signalingState !== "stable") return false;
  if (input.hasRemoteDescription) return false;
  if (
    input.connectionState === "connected" ||
    input.connectionState === "connecting" ||
    input.connectionState === "closing" ||
    input.connectionState === "closed"
  ) {
    return false;
  }
  if (
    input.iceConnectionState === "checking" ||
    input.iceConnectionState === "connected" ||
    input.iceConnectionState === "completed"
  ) {
    return false;
  }
  return true;
}

export function shouldRetryStuckOffer(signalingState: string, hasRemoteDescription: boolean, lastAttemptAt: number, now = Date.now()) {
  if (hasRemoteDescription) return false;
  if (signalingState !== "have-local-offer") return false;
  return now - lastAttemptAt > 12_000;
}

export function shouldForceRelay(input: {
  turnConfigured: boolean;
  alreadyRelay: boolean;
  connectionState: string;
  iceConnectionState: string;
  startedAt: number;
  makingOffer?: boolean;
  now?: number;
}) {
  if (!input.turnConfigured || input.alreadyRelay || input.makingOffer) return false;
  if (input.connectionState === "connected" || input.iceConnectionState === "connected" || input.iceConnectionState === "completed") {
    return false;
  }
  return (input.now ?? Date.now()) - input.startedAt > 12_000;
}

export function shouldRebuild(connectionState: string, iceConnectionState: string, retries: number) {
  if (retries >= 5) return false;
  return connectionState === "failed" || iceConnectionState === "failed";
}

export function shouldIceRestart(connectionState: string, iceConnectionState: string, retries: number) {
  if (retries >= 5) return false;
  return (
    connectionState === "disconnected" ||
    iceConnectionState === "disconnected" ||
    iceConnectionState === "failed"
  );
}

export function localTrackFlags(stream: MediaStream | null) {
  return {
    localAudio: Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live" && track.enabled)),
    localVideo: Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled)),
  };
}

export function remoteTrackFlags(stream: MediaStream | null) {
  return {
    remoteAudio: Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live")),
    remoteVideo: Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled)),
  };
}
