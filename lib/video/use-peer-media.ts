"use client";

import { useEffect, useRef, useState } from "react";
import { getRoomToken } from "@/lib/client/session";
import { rtcConfiguration } from "./ice";
import { onVideoSignal } from "./signal-client";

type Description = { type: RTCSdpType; sdp?: string };

type PeerSlot = {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
};

export function usePeerMedia(
  code: string,
  selfId: string | undefined,
  peerIds: string[],
  localStream: MediaStream | null,
  enabled: boolean,
) {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const slots = useRef(new Map<string, PeerSlot>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const remoteMedia = useRef(new Map<string, MediaStream>());
  const seen = useRef(new Set<string>());
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

    function isOfferer(peerId: string) {
      return (selfRef.current ?? "") < peerId;
    }

    function signalKey(signal: { from: string; description?: Description; candidate?: RTCIceCandidateInit | null }) {
      return [
        signal.from,
        signal.description?.type ?? "",
        signal.description?.sdp?.slice(0, 48) ?? "",
        signal.candidate?.candidate ?? "",
      ].join("|");
    }

    function attachLocal(pc: RTCPeerConnection) {
      const stream = streamRef.current;
      for (const transceiver of pc.getTransceivers()) {
        const kind = transceiver.receiver.track?.kind;
        if (kind !== "audio" && kind !== "video") continue;
        const track = stream?.getTracks().find((item) => item.kind === kind) ?? null;
        if (transceiver.sender.track !== track) {
          void transceiver.sender.replaceTrack(track).catch(() => undefined);
        }
      }
    }

    function bindRemote(peerId: string, track: MediaStreamTrack) {
      const local = streamRef.current;
      if (local?.getTracks().some((item) => item.id === track.id)) return;
      let stream = remoteMedia.current.get(peerId);
      if (!stream) {
        stream = new MediaStream();
        remoteMedia.current.set(peerId, stream);
      }
      for (const existing of stream.getTracks()) {
        if (existing.kind === track.kind && existing.id !== track.id) stream.removeTrack(existing);
      }
      if (!stream.getTracks().includes(track)) stream.addTrack(track);
      const next = stream;
      setRemoteStreams((prev) => ({ ...prev, [peerId]: next }));
      track.onunmute = () => {
        setRemoteStreams((prev) => ({ ...prev, [peerId]: next }));
      };
    }

    function ensure(peerId: string) {
      const existing = slots.current.get(peerId);
      if (existing) {
        attachLocal(existing.pc);
        return existing;
      }
      const pc = new RTCPeerConnection(rtcConfiguration());
      pc.addTransceiver("audio", { direction: "sendrecv" });
      pc.addTransceiver("video", { direction: "sendrecv" });
      const slot: PeerSlot = { pc, makingOffer: false, ignoreOffer: false };
      slots.current.set(peerId, slot);
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void post(peerId, { candidate: event.candidate.toJSON() });
      };
      pc.ontrack = (event) => {
        const local = streamRef.current;
        if (local && event.streams[0]?.id === local.id) return;
        bindRemote(peerId, event.track);
      };
      pc.onnegotiationneeded = () => {
        void (async () => {
          if (closed || !isOfferer(peerId) || pc.signalingState !== "stable") return;
          try {
            slot.makingOffer = true;
            attachLocal(pc);
            await pc.setLocalDescription(await pc.createOffer());
            const local = pc.localDescription;
            if (local && !closed) {
              await post(peerId, { description: { type: local.type, sdp: local.sdp } });
            }
          } catch {
            /* glare */
          } finally {
            slot.makingOffer = false;
          }
        })();
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          try {
            pc.restartIce();
          } catch {
            /* ignore */
          }
        }
      };
      attachLocal(pc);
      return slot;
    }

    async function take(signal: { from: string; description?: Description; candidate?: RTCIceCandidateInit | null }) {
      if (!wanted.has(signal.from) || signal.from === selfRef.current) return;
      const key = signalKey(signal);
      if (seen.current.has(key)) return;
      seen.current.add(key);
      if (seen.current.size > 400) {
        seen.current = new Set([...seen.current].slice(-200));
      }
      const slot = ensure(signal.from);
      const pc = slot.pc;
      try {
        if (signal.description) {
          const offerCollision =
            signal.description.type === "offer" && (slot.makingOffer || pc.signalingState !== "stable");
          const polite = !isOfferer(signal.from);
          slot.ignoreOffer = offerCollision && !polite;
          if (slot.ignoreOffer) return;
          if (offerCollision && polite) {
            await Promise.all([
              pc.setLocalDescription({ type: "rollback" }).catch(() => undefined),
              pc.setRemoteDescription(signal.description),
            ]);
          } else {
            await pc.setRemoteDescription(signal.description);
          }
          const queued = pendingIce.current.get(signal.from) ?? [];
          pendingIce.current.set(signal.from, []);
          for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => undefined);
          if (signal.description.type === "offer") {
            attachLocal(pc);
            await pc.setLocalDescription(await pc.createAnswer());
            const local = pc.localDescription;
            if (local) await post(signal.from, { description: { type: local.type, sdp: local.sdp } });
          }
        }
        if (signal.candidate) {
          if (!pc.remoteDescription) {
            const queued = pendingIce.current.get(signal.from) ?? [];
            queued.push(signal.candidate);
            pendingIce.current.set(signal.from, queued);
          } else {
            await pc.addIceCandidate(signal.candidate).catch(() => undefined);
          }
        }
      } catch {
        seen.current.delete(key);
      }
    }

    for (const peerId of wanted) ensure(peerId);
    for (const [peerId, slot] of slots.current) {
      if (wanted.has(peerId)) continue;
      slot.pc.close();
      slots.current.delete(peerId);
      pendingIce.current.delete(peerId);
      remoteMedia.current.delete(peerId);
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
      const qs = token ? `?poll=1&token=${encodeURIComponent(token)}` : "?poll=1";
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/signals${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        signals?: Array<{ from: string; description?: Description; candidate?: RTCIceCandidateInit | null }>;
      };
      for (const signal of body.signals ?? []) {
        await take(signal).catch(() => undefined);
      }
    }

    void drain();
    const retry = setInterval(() => {
      void drain().catch(() => undefined);
    }, 700);

    return () => {
      closed = true;
      stopSignals();
      clearInterval(retry);
    };
  }, [code, enabled, peersKey, selfId]);

  useEffect(() => {
    if (!localStream) return;
    for (const slot of slots.current.values()) {
      const pc = slot.pc;
      for (const transceiver of pc.getTransceivers()) {
        const kind = transceiver.receiver.track?.kind;
        if (kind !== "audio" && kind !== "video") continue;
        const track = localStream.getTracks().find((item) => item.kind === kind) ?? null;
        if (transceiver.sender.track !== track) {
          void transceiver.sender.replaceTrack(track).catch(() => undefined);
        }
      }
    }
  }, [localStream]);

  useEffect(() => {
    const connections = slots.current;
    const remotes = remoteMedia.current;
    return () => {
      for (const slot of connections.values()) slot.pc.close();
      connections.clear();
      remotes.clear();
    };
  }, []);

  return remoteStreams;
}
