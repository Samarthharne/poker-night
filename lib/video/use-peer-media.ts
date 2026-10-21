"use client";

import { useEffect, useRef, useState } from "react";
import { fetchRtcSignals, sendRtcSignal } from "@/lib/client/api";
import { rtcConfiguration } from "./ice";
import { onVideoSignal } from "./signal-client";
import type { RtcSignal } from "./signal-bus";

function signalKey(signal: RtcSignal) {
  return [
    signal.from,
    signal.to,
    signal.description?.type ?? "",
    signal.description?.sdp?.slice(0, 80) ?? "",
    (signal.candidate as { candidate?: string } | null)?.candidate ?? "",
  ].join("|");
}

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

export function usePeerMedia(
  code: string,
  selfId: string | undefined,
  peerIds: string[],
  localStream: MediaStream | null,
  enabled: boolean,
) {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const streamRef = useRef(localStream);
  const selfRef = useRef(selfId);
  const wantedRef = useRef(peerIds);
  const pcsRef = useRef(new Map<string, RTCPeerConnection>());
  const iceBufRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const seenRef = useRef(new Set<string>());
  const offeringRef = useRef(new Set<string>());
  const lastOfferRef = useRef(new Map<string, number>());
  streamRef.current = localStream;
  selfRef.current = selfId;
  wantedRef.current = peerIds;

  useEffect(() => {
    if (!enabled || !code || !selfId) return;
    let closed = false;
    const pcs = pcsRef.current;
    pcs.clear();
    iceBufRef.current.clear();
    seenRef.current.clear();
    offeringRef.current.clear();
    lastOfferRef.current.clear();

    function publish(peerId: string, track: MediaStreamTrack, streams: readonly MediaStream[]) {
      setRemoteStreams((prev) => {
        const incoming = streams[0];
        const tracks = [
          ...(incoming ? incoming.getTracks() : prev[peerId]?.getTracks() ?? []),
          track,
        ];
        const unique = [...new Map(tracks.map((item) => [item.id, item])).values()].filter(
          (item) => item.readyState !== "ended",
        );
        const next = new MediaStream(unique);
        const current = prev[peerId];
        if (
          current &&
          current.getTracks().length === next.getTracks().length &&
          current.getTracks().every((item) => next.getTracks().some((other) => other.id === item.id))
        ) {
          return prev;
        }
        return { ...prev, [peerId]: next };
      });
    }

    function drop(peerId: string) {
      const pc = pcs.get(peerId);
      if (pc) {
        try {
          pc.close();
        } catch {
          /* ignore */
        }
        pcs.delete(peerId);
      }
      iceBufRef.current.delete(peerId);
      setRemoteStreams((prev) => {
        if (!prev[peerId]) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    }

    async function flushIce(peerId: string, pc: RTCPeerConnection) {
      const queued = iceBufRef.current.get(peerId) ?? [];
      iceBufRef.current.set(peerId, []);
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          /* remote description not ready */
        }
      }
    }

    async function negotiate(peerId: string) {
      const pc = pcs.get(peerId);
      const me = selfRef.current ?? "";
      if (!pc || closed || !me || me >= peerId) return;
      if (offeringRef.current.has(peerId)) return;
      if (pc.signalingState !== "stable") return;
      const now = Date.now();
      if (now - (lastOfferRef.current.get(peerId) ?? 0) < 4000) return;
      lastOfferRef.current.set(peerId, now);
      offeringRef.current.add(peerId);
      try {
        attachLocal(pc, streamRef.current);
        const offer = await pc.createOffer({ iceRestart: pc.connectionState === "failed" });
        if (closed || pc.signalingState !== "stable") return;
        await pc.setLocalDescription(offer);
        const local = pc.localDescription;
        if (!local) return;
        await sendRtcSignal(code, {
          to: peerId,
          description: { type: local.type, sdp: local.sdp ?? undefined },
        });
      } catch {
        /* other player is not ready yet */
      } finally {
        offeringRef.current.delete(peerId);
      }
    }

    function ensurePc(peerId: string) {
      const existing = pcs.get(peerId);
      if (existing && existing.connectionState !== "closed") return existing;
      const pc = new RTCPeerConnection(rtcConfiguration());
      pcs.set(peerId, pc);
      attachLocal(pc, streamRef.current);
      pc.onicecandidate = (event) => {
        if (!event.candidate || closed) return;
        void sendRtcSignal(code, { to: peerId, candidate: event.candidate.toJSON() });
      };
      pc.ontrack = (event) => {
        if (!closed) publish(peerId, event.track, event.streams);
      };
      pc.onconnectionstatechange = () => {
        if (closed) return;
        if (pc.connectionState === "failed") void negotiate(peerId);
      };
      pc.onnegotiationneeded = () => {
        if (!closed) void negotiate(peerId);
      };
      return pc;
    }

    async function apply(signal: RtcSignal) {
      if (closed) return;
      const me = selfRef.current;
      if (!me || signal.from === me || (signal.to && signal.to !== me)) return;
      const key = signalKey(signal);
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      if (seenRef.current.size > 300) {
        seenRef.current = new Set([...seenRef.current].slice(-150));
      }
      const pc = ensurePc(signal.from);
      try {
        if (signal.description?.type === "offer" && signal.description.sdp) {
          if (pc.signalingState !== "stable" && (selfRef.current ?? "") < signal.from) return;
          if (pc.signalingState !== "stable") {
            try {
              await pc.setLocalDescription({ type: "rollback" });
            } catch {
              drop(signal.from);
              ensurePc(signal.from);
            }
          }
          const live = pcs.get(signal.from) ?? pc;
          await live.setRemoteDescription({
            type: "offer",
            sdp: signal.description.sdp,
          });
          attachLocal(live, streamRef.current);
          const answer = await live.createAnswer();
          await live.setLocalDescription(answer);
          const local = live.localDescription;
          if (local) {
            await sendRtcSignal(code, {
              to: signal.from,
              description: { type: local.type, sdp: local.sdp ?? undefined },
            });
          }
          await flushIce(signal.from, live);
        } else if (signal.description?.type === "answer" && signal.description.sdp) {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription({
              type: "answer",
              sdp: signal.description.sdp,
            });
            await flushIce(signal.from, pc);
          }
        } else if (signal.candidate) {
          const candidate = signal.candidate as RTCIceCandidateInit;
          if (!pc.remoteDescription) {
            const queued = iceBufRef.current.get(signal.from) ?? [];
            queued.push(candidate);
            iceBufRef.current.set(signal.from, queued);
          } else {
            try {
              await pc.addIceCandidate(candidate);
            } catch {
              /* stale candidate */
            }
          }
        }
      } catch {
        /* glare or stale description */
      }
    }

    async function pump() {
      if (closed) return;
      const wanted = wantedRef.current.filter((id) => id && id !== selfRef.current);
      for (const id of [...pcs.keys()]) {
        if (!wanted.includes(id)) drop(id);
      }
      for (const id of wanted) ensurePc(id);
      try {
        const signals = (await fetchRtcSignals(code)) as RtcSignal[];
        for (const signal of signals) await apply(signal);
      } catch {
        /* keep the peer connections */
      }
      for (const id of wanted) {
        const pc = pcs.get(id);
        if (!pc) continue;
        attachLocal(pc, streamRef.current);
        if (pc.connectionState === "connected" || pc.connectionState === "connecting") continue;
        void negotiate(id);
      }
    }

    const unsub = onVideoSignal((signal) => {
      void apply(signal as RtcSignal);
    });
    const poll = setInterval(() => {
      void pump();
    }, 1000);
    void pump();

    return () => {
      closed = true;
      unsub();
      clearInterval(poll);
      for (const id of [...pcs.keys()]) drop(id);
      setRemoteStreams({});
    };
  }, [code, enabled, selfId]);

  useEffect(() => {
    if (!localStream) return;
    for (const pc of pcsRef.current.values()) attachLocal(pc, localStream);
  }, [localStream]);

  return remoteStreams;
}
