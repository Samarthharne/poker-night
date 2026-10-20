"use client";

import { useEffect, useRef, useState } from "react";
import { getRoomToken } from "@/lib/client/session";
import { onVideoSignal } from "./signal-client";

type Description = { type: RTCSdpType; sdp?: string };

const ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function usePeerMedia(
  code: string,
  selfId: string | undefined,
  peerIds: string[],
  localStream: MediaStream | null,
  enabled: boolean,
) {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const streamRef = useRef(localStream);
  const selfRef = useRef(selfId);
  streamRef.current = localStream;
  selfRef.current = selfId;
  const peersKey = peerIds.slice().sort().join(",");

  useEffect(() => {
    if (!enabled || !code || !selfId) return;
    let closed = false;
    const wanted = new Set(peersKey ? peersKey.split(",") : []);

    async function post(to: string, body: { description?: Description; candidate?: RTCIceCandidateInit }) {
      const token = getRoomToken(code);
      await fetch(`/api/rooms/${encodeURIComponent(code)}/signals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ to, ...body }),
      });
    }

    function attachLocal(pc: RTCPeerConnection) {
      const stream = streamRef.current;
      if (!stream) return;
      for (const track of stream.getTracks()) {
        const sender = pc.getSenders().find((item) => item.track?.kind === track.kind);
        if (sender) {
          if (sender.track !== track) void sender.replaceTrack(track).catch(() => undefined);
        } else {
          pc.addTrack(track, stream);
        }
      }
    }

    function isOfferer(peerId: string) {
      return (selfRef.current ?? "") < peerId;
    }

    async function offer(peerId: string, pc: RTCPeerConnection) {
      if (!isOfferer(peerId) || pc.signalingState !== "stable") return;
      attachLocal(pc);
      const description = await pc.createOffer();
      if (closed) return;
      await pc.setLocalDescription(description);
      const local = pc.localDescription;
      if (!local) return;
      await post(peerId, { description: { type: local.type, sdp: local.sdp } });
    }

    function ensure(peerId: string) {
      const existing = pcs.current.get(peerId);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: ICE });
      pcs.current.set(peerId, pc);
      attachLocal(pc);
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void post(peerId, { candidate: event.candidate.toJSON() });
      };
      pc.ontrack = (event) => {
        setRemoteStreams((prev) => {
          const stream = prev[peerId] ?? new MediaStream();
          const incoming = event.streams[0]?.getTracks() ?? [event.track];
          for (const track of incoming) {
            if (!stream.getTracks().includes(track)) stream.addTrack(track);
            track.onunmute = () => setRemoteStreams((current) => ({ ...current }));
          }
          return { ...prev, [peerId]: stream };
        });
      };
      void offer(peerId, pc);
      return pc;
    }

    async function take(signal: { from: string; description?: Description; candidate?: RTCIceCandidateInit | null }) {
      if (!wanted.has(signal.from)) return;
      const pc = ensure(signal.from);
      if (signal.description) {
        const offerCollision = signal.description.type === "offer" && pc.signalingState !== "stable";
        const polite = (selfRef.current ?? "") < signal.from;
        if (offerCollision && !polite) return;
        if (offerCollision && polite) {
          await Promise.all([
            pc.setLocalDescription({ type: "rollback" }),
            pc.setRemoteDescription(signal.description),
          ]);
        } else {
          await pc.setRemoteDescription(signal.description);
        }
        const queued = pendingIce.current.get(signal.from) ?? [];
        pendingIce.current.set(signal.from, []);
        for (const candidate of queued) await pc.addIceCandidate(candidate);
        if (signal.description.type === "offer") {
          attachLocal(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          const answer = pc.localDescription;
          if (answer) await post(signal.from, { description: { type: answer.type, sdp: answer.sdp } });
        }
      }
      if (signal.candidate) {
        if (!pc.remoteDescription) {
          const queued = pendingIce.current.get(signal.from) ?? [];
          queued.push(signal.candidate);
          pendingIce.current.set(signal.from, queued);
        } else {
          await pc.addIceCandidate(signal.candidate);
        }
      }
    }

    for (const peerId of wanted) ensure(peerId);
    for (const [peerId, pc] of pcs.current) {
      if (wanted.has(peerId)) continue;
      pc.close();
      pcs.current.delete(peerId);
      pendingIce.current.delete(peerId);
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    }

    const stopSignals = onVideoSignal((signal) => {
      void take(signal).catch(() => undefined);
    });
    async function drain() {
      const token = getRoomToken(code);
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/signals?poll=1`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as { signals?: Array<{ from: string; description?: Description; candidate?: RTCIceCandidateInit | null }> };
      for (const signal of body.signals ?? []) {
        await take(signal).catch(() => undefined);
      }
    }
    void drain();
    const retry = setInterval(() => {
      void drain().catch(() => undefined);
      for (const peerId of wanted) {
        const pc = pcs.current.get(peerId);
        if (!pc || pc.connectionState === "connected" || pc.connectionState === "connecting") continue;
        void offer(peerId, pc);
      }
    }, 900);

    return () => {
      closed = true;
      stopSignals();
      clearInterval(retry);
    };
  }, [code, enabled, peersKey, selfId]);

  useEffect(() => {
    if (!localStream) return;
    for (const [peerId, pc] of pcs.current) {
      for (const track of localStream.getTracks()) {
        const sender = pc.getSenders().find((item) => item.track?.kind === track.kind);
        if (sender) {
          if (sender.track !== track) void sender.replaceTrack(track).catch(() => undefined);
        } else {
          pc.addTrack(track, localStream);
        }
      }
      if ((selfId ?? "") < peerId && pc.signalingState === "stable") {
        void pc
          .createOffer()
          .then(async (description) => {
            await pc.setLocalDescription(description);
            const token = getRoomToken(code);
            const local = pc.localDescription;
            if (!local) return;
            await fetch(`/api/rooms/${encodeURIComponent(code)}/signals`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ to: peerId, description: { type: local.type, sdp: local.sdp } }),
            });
          })
          .catch(() => undefined);
      }
    }
  }, [code, localStream, selfId]);

  useEffect(() => {
    const connections = pcs.current;
    return () => {
      for (const pc of connections.values()) pc.close();
      connections.clear();
    };
  }, []);

  return remoteStreams;
}
