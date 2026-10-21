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
  shouldIceRestart,
  shouldOffer,
  shouldRebuild,
  type PeerDiagnostics,
} from "./peer-session";
import { onVideoSignal } from "./signal-client";
import { createRtcMessage, nextRetryDelay, type RtcMessage } from "./rtc-protocol";

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
};

function attachLocal(pc: RTCPeerConnection, stream: MediaStream | null) {
  if (!stream) {
    if (pc.getTransceivers().length === 0) {
      pc.addTransceiver("audio", { direction: "sendrecv" });
      pc.addTransceiver("video", { direction: "sendrecv" });
    }
    return;
  }
  for (const track of stream.getTracks()) {
    const sender = pc.getSenders().find((item) => item.track?.kind === track.kind);
    if (sender) {
      if (sender.track?.id !== track.id) void sender.replaceTrack(track);
    } else {
      pc.addTrack(track, stream);
    }
  }
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
  streamRef.current = localStream;
  selfRef.current = selfId;
  wantedRef.current = peerIds;

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
    setDiagnostics(next);
  }, []);

  useEffect(() => {
    if (!enabled || !code || !selfId) return;
    let closed = false;
    const slots = slotsRef.current;
    slots.clear();
    seenRef.current.clear();

    async function post(message: RtcMessage) {
      const result = await sendRtcSignal(code, message);
      if (!result || result.ok === false) {
        rtcLog("signal post failed", { type: message.type, to: message.to });
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
      const existing = slots.get(peerId);
      if (existing && existing.pc.connectionState !== "closed") {
        if (sessionId && sessionId !== existing.sessionId && sessionId !== "legacy") {
          drop(peerId);
        } else {
          return existing;
        }
      }
      const pc = new RTCPeerConnection({
        ...iceRef.current,
        iceTransportPolicy: forceRelay ? "relay" : "all",
      });
      const slot: Slot = {
        pc,
        sessionId: sessionId && sessionId !== "legacy" ? sessionId : crypto.randomUUID(),
        iceQueue: [],
        makingOffer: false,
        retryAttempt: existing?.retryAttempt ?? 0,
        lastError: null,
        lastAttemptAt: Date.now(),
        videoFrame: false,
        candidateType: "unknown",
        transport: "unknown",
        backoffUntil: 0,
      };
      slots.set(peerId, slot);
      attachLocal(pc, streamRef.current);
      pc.onicecandidate = (event) => {
        if (closed) return;
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
          const tracks = [...(event.streams[0]?.getTracks() ?? prev[peerId]?.getTracks() ?? []), event.track];
          const unique = [...new Map(tracks.map((item) => [item.id, item])).values()].filter(
            (item) => item.readyState !== "ended",
          );
          return { ...prev, [peerId]: new MediaStream(unique) };
        });
        event.track.addEventListener("ended", () => publishDiag());
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
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          void recover(peerId);
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

    async function negotiate(peerId: string, iceRestart = false) {
      const me = selfRef.current ?? "";
      if (!shouldOffer(me, peerId)) return;
      const slot = ensureSlot(peerId);
      if (!slot || slot.makingOffer || slot.pc.signalingState !== "stable") return;
      if (Date.now() < slot.backoffUntil) return;
      slot.makingOffer = true;
      slot.lastAttemptAt = Date.now();
      try {
        attachLocal(slot.pc, streamRef.current);
        const offer = await slot.pc.createOffer({ iceRestart });
        if (closed || slot.pc.signalingState !== "stable") return;
        await slot.pc.setLocalDescription(offer);
        const local = slot.pc.localDescription;
        if (!local) return;
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
      rtcLog("rebuild peer", { peerId, attempt: slot.retryAttempt });
      await loadIce();
      drop(peerId);
      if (!ensureSlot(peerId)) return;
      await negotiate(peerId);
    }

    async function apply(message: RtcMessage) {
      if (closed) return;
      const me = selfRef.current;
      if (!me || message.from === me || (message.to && message.to !== me)) return;
      if (!iceReadyRef.current && message.type !== "hangup") return;
      const decision = canApplyMessage(slots.get(message.from)?.sessionId, message, seenRef.current);
      if (!decision.ok) return;
      seenRef.current.add(message.id);
      if (seenRef.current.size > 400) seenRef.current = new Set([...seenRef.current].slice(-200));
      if (message.type === "hangup") {
        drop(message.from);
        return;
      }
      const slot = ensureSlot(message.from, message.sessionId === "legacy" ? undefined : message.sessionId);
      if (!slot) return;
      try {
        if (message.type === "offer" || message.type === "ice-restart") {
          const glare = glareDecision({
            selfId: me,
            peerId: message.from,
            makingOffer: slot.makingOffer,
            signalingState: slot.pc.signalingState,
            incomingType: "offer",
          });
          if (glare.ignore) return;
          if (glare.rollback) {
            try {
              await slot.pc.setLocalDescription({ type: "rollback" });
            } catch {
              drop(message.from);
              if (!ensureSlot(message.from, message.sessionId)) return;
            }
          }
          const live = slots.get(message.from);
          if (!live || !message.payload.sdp?.sdp) return;
          await live.pc.setRemoteDescription({
            type: "offer",
            sdp: message.payload.sdp.sdp,
          });
          live.iceQueue = await addQueuedIce(live.pc, live.iceQueue);
          attachLocal(live.pc, streamRef.current);
          const answer = await live.pc.createAnswer();
          await live.pc.setLocalDescription(answer);
          const local = live.pc.localDescription;
          if (local) {
            await post(
              createRtcMessage({
                roomId: roomIdRef.current,
                from: me,
                to: message.from,
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
              rtcLog("stale ice", { peerId: message.from });
            }
          }
        } else if (message.type === "renegotiate") {
          await negotiate(message.from);
        }
      } catch (error) {
        slot.lastError = error instanceof Error ? error.message : "Signaling failed.";
        rtcLog("apply failed", { peerId: message.from, type: message.type, error: slot.lastError });
      }
      await sendRtcSignal(code, { ackIds: [message.id] });
      publishDiag();
    }

    async function pump() {
      if (closed || !iceReadyRef.current) return;
      const wanted = wantedRef.current.filter((id) => id && id !== selfRef.current);
      for (const id of [...slots.keys()]) {
        if (!wanted.includes(id)) drop(id, true);
      }
      for (const id of wanted) ensureSlot(id);
      try {
        const messages = (await fetchRtcSignals(code)) as RtcMessage[];
        for (const message of messages) await apply(message);
      } catch (error) {
        rtcLog("poll failed", { error: String(error) });
      }
      for (const id of wanted) {
        const slot = slots.get(id);
        if (!slot) continue;
        attachLocal(slot.pc, streamRef.current);
        if (slot.pc.connectionState === "connected") continue;
        void negotiate(id);
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
      poll = setInterval(() => {
        void pump();
      }, 700);
      await pump();
    })();

    return () => {
      closed = true;
      unsub();
      clearInterval(poll);
      clearTimeout(refreshTimer);
      void broadcast?.unsubscribe();
      for (const id of [...slots.keys()]) drop(id);
      setRemoteStreams({});
      setDiagnostics({});
    };
  }, [code, enabled, selfId, forceRelay, publishDiag]);

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
