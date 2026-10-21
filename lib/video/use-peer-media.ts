"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRtcIce, fetchRtcSignals, sendRtcSignal } from "@/lib/client/api";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { rtcConfiguration, type IceResponse } from "./ice";
import { rtcLog } from "./log";
import {
  canApplyMessage,
  glareDecision,
  localTrackFlags,
  remoteTrackFlags,
  shouldForceRelay,
  shouldIceRestart,
  shouldOffer,
  shouldPollOffer,
  shouldRebuild,
  shouldRetryStuckOffer,
  type PeerDiagnostics,
} from "./peer-session";
import { onVideoSignal } from "./signal-client";
import { createRtcMessage, mergeRtcMessages, nextRetryDelay, pairSessionId, samePlayerId, type RtcMessage } from "./rtc-protocol";

type Slot = {
  pc: RTCPeerConnection;
  sessionId: string;
  iceQueue: RTCIceCandidateInit[];
  makingOffer: boolean;
  retryAttempt: number;
  lastError: string | null;
  lastAttemptAt: number;
  videoFrame: boolean;
  candidateType: PeerDiagnostics["candidateType"];
  transport: PeerDiagnostics["transport"];
  backoffUntil: number;
  openedAt: number;
};

function senderForKind(pc: RTCPeerConnection, kind: string) {
  return (
    pc.getSenders().find((item) => item.track?.kind === kind) ??
    pc.getTransceivers().find((item) => item.receiver.track?.kind === kind)?.sender
  );
}

function attachLocal(pc: RTCPeerConnection, stream: MediaStream | null) {
  const kinds = ["audio", "video"] as const;
  if (!stream) {
    for (const kind of kinds) {
      if (!senderForKind(pc, kind)) pc.addTransceiver(kind, { direction: "sendrecv" });
    }
    return;
  }
  for (const track of stream.getTracks()) {
    const sender = senderForKind(pc, track.kind);
    if (sender) {
      if (sender.track?.id !== track.id) void sender.replaceTrack(track);
    } else {
      pc.addTrack(track, stream);
    }
  }
}

function waitForIceGathering(pc: RTCPeerConnection, ms = 2_000) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener("icegatheringstatechange", onChange);
      pc.removeEventListener("icecandidate", onCandidate);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const onCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate?.candidate?.includes("typ relay")) finish();
    };
    pc.addEventListener("icegatheringstatechange", onChange);
    pc.addEventListener("icecandidate", onCandidate);
    window.setTimeout(finish, ms);
  });
}

async function addQueuedIce(pc: RTCPeerConnection, queued: RTCIceCandidateInit[]) {
  const leftover: RTCIceCandidateInit[] = [];
  for (const candidate of queued) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      leftover.push(candidate);
      rtcLog("addIceCandidate failed", { error: String(error) });
    }
  }
  return leftover;
}

export function usePeerMedia(
  code: string,
  selfId: string | undefined,
  peerIds: string[],
  localStream: MediaStream | null,
  enabled: boolean,
  incomingMessages: unknown[] = [],
) {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [diagnostics, setDiagnostics] = useState<Record<string, PeerDiagnostics>>({});
  const [turnConfigured, setTurnConfigured] = useState(false);
  const [turnWarning, setTurnWarning] = useState<string | null>(null);
  const [iceFetchStatus, setIceFetchStatus] = useState<"pending" | "ok" | "error" | "missing-turn">(
    "pending",
  );
  const [forceRelay, setForceRelay] = useState(false);
  const streamRef = useRef(localStream);
  const selfRef = useRef(selfId);
  const wantedRef = useRef(peerIds);
  const slotsRef = useRef(new Map<string, Slot>());
  const seenRef = useRef(new Set<string>());
  const iceRef = useRef<RTCConfiguration>(rtcConfiguration());
  const iceReadyRef = useRef(false);
  const roomIdRef = useRef("");
  const channelRef = useRef<string | null>(null);
  const incomingRef = useRef(incomingMessages);
  const pumpRef = useRef<() => void>(() => {});
  streamRef.current = localStream;
  selfRef.current = selfId;
  wantedRef.current = Array.isArray(peerIds) ? peerIds : [];
  incomingRef.current = incomingMessages;

  const remotesRef = useRef(remoteStreams);
  remotesRef.current = remoteStreams;

  const publishDiag = useCallback(() => {
    const next: Record<string, PeerDiagnostics> = {};
    for (const [playerId, slot] of slotsRef.current) {
      const remote = remotesRef.current[playerId] ?? null;
      next[playerId] = {
        playerId,
        sessionId: slot.sessionId,
        offerer: shouldOffer(selfRef.current ?? "", playerId),
        polite: !shouldOffer(selfRef.current ?? "", playerId),
        connectionState: slot.pc.connectionState,
        iceConnectionState: slot.pc.iceConnectionState,
        iceGatheringState: slot.pc.iceGatheringState,
        signalingState: slot.pc.signalingState,
        ...localTrackFlags(streamRef.current),
        ...remoteTrackFlags(remote),
        videoFrame: slot.videoFrame,
        candidateType: slot.candidateType,
        transport: slot.transport,
        lastError: slot.lastError,
        lastAttemptAt: slot.lastAttemptAt,
        retryAttempt: slot.retryAttempt,
      };
    }
    for (const id of wantedRef.current) {
      if (!id || samePlayerId(id, selfRef.current) || next[id]) continue;
      next[id] = {
        playerId: id,
        sessionId: "",
        offerer: shouldOffer(selfRef.current ?? "", id),
        polite: !shouldOffer(selfRef.current ?? "", id),
        connectionState: "idle",
        iceConnectionState: "new",
        iceGatheringState: "new",
        signalingState: "stable",
        ...localTrackFlags(streamRef.current),
        remoteAudio: false,
        remoteVideo: false,
        videoFrame: false,
        candidateType: "unknown",
        transport: "unknown",
        lastError: "Waiting to open the camera link.",
        lastAttemptAt: 0,
        retryAttempt: 0,
      };
    }
    setDiagnostics(next);
  }, []);

  useEffect(() => {
    if (!enabled || !code || !selfId) return;
    let closed = false;
    const slots = slotsRef.current;
    slots.clear();
    seenRef.current.clear();
    iceReadyRef.current = false;
    const relayOnly = { current: forceRelay };
    const iceTurn = { current: false };

    function canonicalPeerId(id: string) {
      return wantedRef.current.find((item) => samePlayerId(item, id)) ?? id;
    }

    async function post(message: RtcMessage) {
      try {
        const result = (await sendRtcSignal(code, message)) as { ok?: boolean; error?: string } | null;
        if (!result || result.ok === false) {
          const err = result?.error || "Signal post failed.";
          if (message.type !== "ice-candidate") {
            const slot = slots.get(message.to);
            if (slot) slot.lastError = err;
          }
          rtcLog("signal post failed", { type: message.type, to: message.to, err });
        }
      } catch (error) {
        if (message.type === "ice-candidate") return;
        const err = error instanceof Error ? error.message : "Signal post failed.";
        const slot = slots.get(message.to);
        if (slot) slot.lastError = err;
        rtcLog("signal post failed", { type: message.type, to: message.to, err });
      }
    }

    function drop(peerId: string, sendHangup = false) {
      const slot = slots.get(peerId);
      if (!slot) return;
      if (sendHangup) {
        void post(
          createRtcMessage({
            roomId: roomIdRef.current,
            from: selfRef.current ?? "",
            to: peerId,
            type: "hangup",
            sessionId: slot.sessionId,
          }),
        );
      }
      try {
        slot.pc.close();
      } catch {
        rtcLog("peer close failed", { peerId });
      }
      slots.delete(peerId);
      setRemoteStreams((prev) => {
        if (!prev[peerId]) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    }

    function ensureSlot(peerId: string, sessionId?: string) {
      if (!iceReadyRef.current) return null;
      const pairId = pairSessionId(selfRef.current ?? "", peerId);
      const incoming = sessionId && sessionId !== "legacy" ? sessionId : pairId;
      const existing = slots.get(peerId);
      if (existing && existing.pc.connectionState !== "closed") {
        if (sessionId && sessionId !== "legacy" && sessionId !== existing.sessionId) {
          const unused = existing.pc.signalingState === "stable" && !existing.pc.currentRemoteDescription;
          if (unused) {
            existing.sessionId = sessionId;
            return existing;
          }
          drop(peerId);
        } else {
          return existing;
        }
      }
      let pc: RTCPeerConnection;
      try {
        pc = new RTCPeerConnection({
          ...iceRef.current,
          iceTransportPolicy: relayOnly.current ? "relay" : "all",
        });
      } catch (error) {
        rtcLog("pc create failed", { peerId, error: String(error) });
        try {
          pc = new RTCPeerConnection(rtcConfiguration());
        } catch (fallback) {
          rtcLog("pc fallback failed", { peerId, error: String(fallback) });
          return null;
        }
      }
      const slot: Slot = {
        pc,
        sessionId: incoming,
        iceQueue: [],
        makingOffer: false,
        retryAttempt: existing?.retryAttempt ?? 0,
        lastError: null,
        lastAttemptAt: Date.now(),
        videoFrame: false,
        candidateType: "unknown",
        transport: "unknown",
        backoffUntil: 0,
        openedAt: Date.now(),
      };
      slots.set(peerId, slot);
      attachLocal(pc, streamRef.current);
      pc.onicecandidate = (event) => {
        if (closed || slots.get(peerId) !== slot || !event.candidate) return;
        void post(
          createRtcMessage({
            roomId: roomIdRef.current,
            from: selfRef.current ?? "",
            to: peerId,
            type: "ice-candidate",
            sessionId: slot.sessionId,
            payload: { candidate: event.candidate ? event.candidate.toJSON() : null },
          }),
        );
      };
      pc.ontrack = (event) => {
        if (closed) return;
        setRemoteStreams((prev) => {
          const tracks = new Map<string, MediaStreamTrack>();
          for (const track of prev[peerId]?.getTracks() ?? []) tracks.set(track.id, track);
          for (const track of event.streams[0]?.getTracks() ?? []) tracks.set(track.id, track);
          tracks.set(event.track.id, event.track);
          const next = new MediaStream([...tracks.values()].filter((track) => track.readyState !== "ended"));
          const current = prev[peerId];
          if (
            current &&
            current.getTracks().length === next.getTracks().length &&
            current.getTracks().every((track) => next.getTracks().some((item) => item.id === track.id))
          ) {
            return prev;
          }
          return { ...prev, [peerId]: next };
        });
        event.track.addEventListener("unmute", () => publishDiag());
        event.track.addEventListener("ended", () => publishDiag());
        publishDiag();
      };
      pc.onconnectionstatechange = () => {
        rtcLog("connectionState", { peerId, state: pc.connectionState });
        publishDiag();
        if (pc.connectionState === "failed") void recover(peerId);
      };
      pc.oniceconnectionstatechange = () => {
        rtcLog("iceConnectionState", { peerId, state: pc.iceConnectionState });
        publishDiag();
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          slot.retryAttempt = 0;
          void readPair(slot);
        }
        if (pc.iceConnectionState === "failed") void recover(peerId);
        if (pc.iceConnectionState === "disconnected") {
          window.setTimeout(() => {
            if (closed) return;
            const live = slots.get(peerId);
            if (live?.pc === pc && pc.iceConnectionState === "disconnected") void recover(peerId);
          }, 2500);
        }
      };
      pc.onnegotiationneeded = () => {
        if (!closed) void negotiate(peerId);
      };
      return slot;
    }

    async function readPair(slot: Slot) {
      try {
        const stats = await slot.pc.getStats();
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && (report.nominated || report.selected)) {
            const remote = stats.get(report.remoteCandidateId as string) as
              | { candidateType?: string; protocol?: string }
              | undefined;
            const kind = remote?.candidateType;
            if (kind === "host" || kind === "srflx" || kind === "relay") slot.candidateType = kind;
            if (remote?.protocol === "udp" || remote?.protocol === "tcp") slot.transport = remote.protocol;
          }
        });
      } catch {
        /* stats unavailable */
      }
      publishDiag();
    }

    async function negotiate(peerId: string, iceRestart = false, force = false) {
      const me = selfRef.current ?? "";
      const slot = ensureSlot(peerId);
      if (!slot) return;
      if (!force && !shouldOffer(me, peerId)) return;
      if (force && (slot.pc.currentRemoteDescription || Date.now() - slot.openedAt < 2_000)) return;
      if (slot.makingOffer || slot.pc.signalingState !== "stable") return;
      if (Date.now() < slot.backoffUntil) return;
      slot.makingOffer = true;
      slot.lastAttemptAt = Date.now();
      try {
        attachLocal(slot.pc, streamRef.current);
        const offer = await slot.pc.createOffer({ iceRestart });
        if (closed || slot.pc.signalingState !== "stable") return;
        await slot.pc.setLocalDescription(offer);
        await waitForIceGathering(slot.pc);
        if (closed || slots.get(peerId) !== slot) return;
        const local = slot.pc.localDescription;
        if (!local) return;
        slot.lastAttemptAt = Date.now();
        await post(
          createRtcMessage({
            roomId: roomIdRef.current,
            from: me,
            to: peerId,
            type: iceRestart ? "ice-restart" : "offer",
            sessionId: slot.sessionId,
            payload: { sdp: { type: local.type, sdp: local.sdp ?? undefined } },
          }),
        );
      } catch (error) {
        slot.lastError = error instanceof Error ? error.message : "Offer failed.";
        rtcLog("offer failed", { peerId, error: slot.lastError });
      } finally {
        slot.makingOffer = false;
        publishDiag();
      }
    }

    async function recover(peerId: string) {
      const slot = slots.get(peerId);
      if (!slot || closed) return;
      if (Date.now() < slot.backoffUntil) return;
      const iceState = slot.pc.iceConnectionState;
      const conn = slot.pc.connectionState;
      if (shouldIceRestart(conn, iceState, slot.retryAttempt) && !shouldRebuild(conn, iceState, slot.retryAttempt)) {
        slot.retryAttempt += 1;
        slot.backoffUntil = Date.now() + nextRetryDelay(slot.retryAttempt);
        rtcLog("ice restart", { peerId, attempt: slot.retryAttempt });
        await negotiate(peerId, true);
        return;
      }
      if (!shouldRebuild(conn, iceState, slot.retryAttempt)) return;
      slot.retryAttempt += 1;
      slot.backoffUntil = Date.now() + nextRetryDelay(slot.retryAttempt);
      if (iceTurn.current) relayOnly.current = true;
      rtcLog("rebuild peer", { peerId, attempt: slot.retryAttempt });
      await loadIce();
      drop(peerId);
      if (!ensureSlot(peerId)) return;
      await negotiate(peerId);
    }

    async function apply(message: RtcMessage) {
      if (closed) return;
      const me = selfRef.current;
      if (!me || samePlayerId(message.from, me)) return;
      if (message.to && !samePlayerId(message.to, me)) return;
      if (!iceReadyRef.current && message.type !== "hangup") return;
      const peerId = canonicalPeerId(message.from);
      const decision = canApplyMessage(slots.get(peerId)?.sessionId, message, seenRef.current);
      if (!decision.ok) return;
      seenRef.current.add(message.id);
      if (seenRef.current.size > 400) seenRef.current = new Set([...seenRef.current].slice(-200));
      if (message.type === "hangup") {
        drop(peerId);
        return;
      }
      const slot = ensureSlot(peerId, message.sessionId === "legacy" ? undefined : message.sessionId);
      if (!slot) return;
      try {
        if (message.type === "offer" || message.type === "ice-restart") {
          const glare = glareDecision({
            selfId: me,
            peerId,
            makingOffer: slot.makingOffer,
            signalingState: slot.pc.signalingState,
            incomingType: "offer",
            hasRemoteDescription: Boolean(slot.pc.currentRemoteDescription),
            iceConnectionState: slot.pc.iceConnectionState,
          });
          if (glare.ignore) return;
          if (glare.rollback) {
            try {
              await slot.pc.setLocalDescription({ type: "rollback" });
            } catch {
              drop(peerId);
              if (!ensureSlot(peerId, message.sessionId)) return;
            }
          }
          const live = slots.get(peerId);
          if (!live || !message.payload.sdp?.sdp) return;
          await live.pc.setRemoteDescription({
            type: "offer",
            sdp: message.payload.sdp.sdp,
          });
          live.iceQueue = await addQueuedIce(live.pc, live.iceQueue);
          attachLocal(live.pc, streamRef.current);
          const answer = await live.pc.createAnswer();
          await live.pc.setLocalDescription(answer);
          await waitForIceGathering(live.pc);
          if (closed || slots.get(peerId) !== live) return;
          const local = live.pc.localDescription;
          if (local) {
            await post(
              createRtcMessage({
                roomId: roomIdRef.current,
                from: me,
                to: peerId,
                type: "answer",
                sessionId: live.sessionId,
                payload: { sdp: { type: local.type, sdp: local.sdp ?? undefined } },
              }),
            );
          }
        } else if (message.type === "answer" && message.payload.sdp?.sdp) {
          if (slot.pc.signalingState === "have-local-offer") {
            await slot.pc.setRemoteDescription({ type: "answer", sdp: message.payload.sdp.sdp });
            slot.iceQueue = await addQueuedIce(slot.pc, slot.iceQueue);
          }
        } else if (message.type === "ice-candidate") {
          const candidate = message.payload.candidate ?? null;
          if (!candidate) return;
          if (!slot.pc.remoteDescription) slot.iceQueue.push(candidate);
          else {
            try {
              await slot.pc.addIceCandidate(candidate);
            } catch (error) {
              slot.lastError = error instanceof Error ? error.message : "ICE candidate rejected.";
              rtcLog("stale ice", { peerId });
            }
          }
        } else if (message.type === "renegotiate") {
          await negotiate(peerId);
        }
      } catch (error) {
        slot.lastError = error instanceof Error ? error.message : "Signaling failed.";
        rtcLog("apply failed", { peerId, type: message.type, error: slot.lastError });
      }
      await sendRtcSignal(code, { ackIds: [message.id] });
      publishDiag();
    }

    async function pump() {
      if (closed || !iceReadyRef.current) return;
      const wanted = wantedRef.current.filter((id) => id && !samePlayerId(id, selfRef.current));
      for (const id of [...slots.keys()]) {
        if (!wanted.some((item) => samePlayerId(item, id))) drop(id, true);
      }
      for (const id of wanted) {
        try {
          ensureSlot(id);
        } catch (error) {
          rtcLog("ensureSlot failed", { peerId: id, error: String(error) });
        }
      }
      try {
        const messages = mergeRtcMessages(incomingRef.current, await fetchRtcSignals(code));
        for (const message of messages) await apply(message);
      } catch (error) {
        rtcLog("poll failed", { error: String(error) });
        for (const message of mergeRtcMessages(incomingRef.current)) await apply(message);
      }
      for (const id of wanted) {
        const slot = slots.get(id);
        if (!slot) continue;
        attachLocal(slot.pc, streamRef.current);
        if (
          shouldForceRelay({
            turnConfigured: iceTurn.current,
            alreadyRelay: relayOnly.current,
            connectionState: slot.pc.connectionState,
            iceConnectionState: slot.pc.iceConnectionState,
            startedAt: slot.openedAt,
            makingOffer: slot.makingOffer,
          })
        ) {
          rtcLog("force relay", { peerId: id });
          relayOnly.current = true;
          drop(id);
          if (!ensureSlot(id)) continue;
          void negotiate(id);
          continue;
        }
        const hasRemote = Boolean(slot.pc.currentRemoteDescription);
        if (!slot.makingOffer && shouldRetryStuckOffer(slot.pc.signalingState, hasRemote, slot.lastAttemptAt)) {
          rtcLog("retry stuck offer", { peerId: id });
          drop(id);
          if (!ensureSlot(id)) continue;
          void negotiate(id);
          continue;
        }
        if (
          shouldPollOffer({
            connectionState: slot.pc.connectionState,
            iceConnectionState: slot.pc.iceConnectionState,
            signalingState: slot.pc.signalingState,
            hasRemoteDescription: hasRemote,
          })
        ) {
          const me = selfRef.current ?? "";
          void negotiate(id, false, !shouldOffer(me, id));
        }
      }
      publishDiag();
    }

    const unsub = onVideoSignal((signal) => {
      const legacy = signal as {
        from: string;
        to?: string;
        description?: { type: string; sdp?: string };
        candidate?: RTCIceCandidateInit | null;
      };
      if (legacy.description?.type) {
        void apply({
          id: `sse-${legacy.from}-${legacy.description.type}-${Date.now()}`,
          roomId: roomIdRef.current,
          from: legacy.from,
          to: selfRef.current ?? "",
          type: legacy.description.type === "answer" ? "answer" : "offer",
          sessionId: "legacy",
          createdAt: Date.now(),
          payload: { sdp: legacy.description },
        });
      } else if (legacy.candidate) {
        void apply({
          id: `sse-${legacy.from}-ice-${Date.now()}`,
          roomId: roomIdRef.current,
          from: legacy.from,
          to: selfRef.current ?? "",
          type: "ice-candidate",
          sessionId: "legacy",
          createdAt: Date.now(),
          payload: { candidate: legacy.candidate },
        });
      }
    });

    let broadcast: ReturnType<NonNullable<ReturnType<typeof getSupabaseBrowserClient>>["channel"]> | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    async function loadIce() {
      const ice = await fetchRtcIce(code);
      if (closed) return false;
      if (!ice?.iceServers?.length) {
        iceReadyRef.current = false;
        setIceFetchStatus("error");
        setTurnConfigured(false);
        setTurnWarning("Could not load ICE servers. Retrying.");
        rtcLog("ICE fetch failed");
        return false;
      }
      iceRef.current = rtcConfiguration(ice.iceServers);
      iceReadyRef.current = true;
      iceTurn.current = Boolean(ice.turnConfigured);
      if (iceTurn.current) relayOnly.current = true;
      setTurnConfigured(Boolean(ice.turnConfigured));
      setTurnWarning(ice.warning ?? null);
      setIceFetchStatus(ice.turnConfigured ? "ok" : "missing-turn");
      roomIdRef.current = ice.roomId ?? "";
      channelRef.current = ice.channel ?? null;
      if (!ice.turnConfigured && ice.warning) rtcLog(ice.warning);
      const refreshIn = Math.max(30_000, Math.floor(((ice.ttlSeconds ?? 3600) * 1000) / 2));
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void loadIce();
      }, refreshIn);
      return true;
    }

    void (async () => {
      let loaded = await loadIce();
      let attempt = 0;
      while (!closed && !loaded && attempt < 5) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, nextRetryDelay(attempt)));
        loaded = await loadIce();
      }
      if (closed || !loaded) return;
      if (channelRef.current && isSupabaseConfigured()) {
        const client = getSupabaseBrowserClient();
        if (client) {
          broadcast = client.channel(channelRef.current);
          (
            broadcast as unknown as {
              on: (
                type: "broadcast",
                filter: { event: string },
                callback: (event: { payload?: RtcMessage }) => void,
              ) => void;
            }
          ).on("broadcast", { event: "rtc" }, (event) => {
            if (event.payload) void apply(event.payload);
          });
          void broadcast.subscribe();
        }
      }
      pumpRef.current = () => {
        if (!closed) void pump();
      };
      poll = setInterval(() => {
        void pump();
      }, 700);
      await pump();
    })();

    return () => {
      closed = true;
      pumpRef.current = () => {};
      iceReadyRef.current = false;
      unsub();
      clearInterval(poll);
      clearTimeout(refreshTimer);
      void broadcast?.unsubscribe();
      for (const id of [...slots.keys()]) drop(id);
      setRemoteStreams({});
      setDiagnostics({});
    };
  }, [code, enabled, selfId, forceRelay, publishDiag]);

  const peerKey = [...wantedRef.current].filter(Boolean).sort().join("|");
  useEffect(() => {
    publishDiag();
    pumpRef.current();
  }, [peerKey, publishDiag]);

  useEffect(() => {
    if (!localStream) return;
    for (const slot of slotsRef.current.values()) attachLocal(slot.pc, localStream);
  }, [localStream]);

  const reconnect = useCallback(
    (peerId?: string) => {
      const ids = peerId ? [peerId] : wantedRef.current;
      for (const id of ids) {
        const slot = slotsRef.current.get(id);
        if (slot) slot.backoffUntil = 0;
      }
    },
    [],
  );

  const restartIce = useCallback((peerId: string) => {
    const slot = slotsRef.current.get(peerId);
    if (!slot) return;
    slot.backoffUntil = 0;
    if (slot.pc.restartIce) slot.pc.restartIce();
  }, []);

  const markFrame = useCallback((peerId: string, ready: boolean) => {
    const slot = slotsRef.current.get(peerId);
    if (!slot) return;
    slot.videoFrame = ready;
  }, []);

  return {
    remoteStreams,
    diagnostics,
    turnConfigured,
    turnWarning,
    iceFetchStatus,
    forceRelay,
    setForceRelay,
    reconnect,
    restartIce,
    markFrame,
  };
}

export type { IceResponse, PeerDiagnostics };
