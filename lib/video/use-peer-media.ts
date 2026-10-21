"use client";

import { useEffect, useRef, useState } from "react";
import type Peer from "peerjs";
import type { MediaConnection } from "peerjs";
import { peerName, playerIdFromPeer } from "./peer-id";

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    {
      urls: ["turn:0.peerjs.com:3478", "turn:0.peerjs.com:3478?transport=tcp"],
      username: "peerjs",
      credential: "peerjsp",
    },
  ],
};

type CallEntry = {
  call: MediaConnection;
  started: number;
  gotStream: boolean;
};

function pushTracks(call: MediaConnection, stream: MediaStream) {
  const pc = call.peerConnection;
  if (!pc) return false;
  const senders = pc.getSenders();
  let attached = 0;
  for (const track of stream.getTracks()) {
    const sender = senders.find((item) => item.track?.kind === track.kind);
    if (sender) {
      if (!sender.track || sender.track.id !== track.id) void sender.replaceTrack(track);
      attached += 1;
    } else {
      try {
        pc.addTrack(track, stream);
        attached += 1;
      } catch {
        /* transceiver already exists */
      }
    }
  }
  return attached > 0;
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
  const callsRef = useRef(new Map<string, CallEntry>());
  const remotesRef = useRef(remoteStreams);
  const dialMissingRef = useRef<() => void>(() => undefined);
  streamRef.current = localStream;
  selfRef.current = selfId;
  wantedRef.current = peerIds;
  remotesRef.current = remoteStreams;

  useEffect(() => {
    if (!enabled || !code || !selfId) return;
    let closed = false;
    let peer: Peer | null = null;
    const calls = callsRef.current;
    calls.clear();

    function publish(peerId: string, stream: MediaStream) {
      const entry = calls.get(peerId);
      if (entry) entry.gotStream = true;
      setRemoteStreams((prev) => (prev[peerId] === stream ? prev : { ...prev, [peerId]: stream }));
    }

    function forget(peerId: string, call: MediaConnection) {
      const entry = calls.get(peerId);
      if (entry && entry.call !== call) return;
      calls.delete(peerId);
      setRemoteStreams((prev) => {
        if (!prev[peerId]) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    }

    function watch(peerId: string, call: MediaConnection) {
      const prev = calls.get(peerId);
      if (prev && prev.call !== call) {
        try {
          prev.call.close();
        } catch {
          /* ignore */
        }
      }
      calls.set(peerId, { call, started: Date.now(), gotStream: Boolean(remotesRef.current[peerId]) });
      call.on("stream", (stream) => {
        if (closed) return;
        if (stream.getTracks().some((track) => track.readyState !== "ended")) {
          publish(peerId, stream);
        }
      });
      call.on("close", () => forget(peerId, call));
      call.on("error", () => forget(peerId, call));
    }

    function dial(targetId: string) {
      if (!peer?.open || closed || targetId === selfRef.current) return;
      const stream = streamRef.current;
      if (!stream) return;
      const entry = calls.get(targetId);
      if (entry?.gotStream || remotesRef.current[targetId]) return;
      if (entry && Date.now() - entry.started < 8000) return;
      if (entry) {
        try {
          entry.call.close();
        } catch {
          /* retry a hung invite */
        }
        calls.delete(targetId);
      }
      try {
        const call = peer.call(peerName(code, targetId), stream);
        if (call) watch(targetId, call);
      } catch {
        /* other player has not opened a PeerJS id yet */
      }
    }

    function dialMissing() {
      for (const id of wantedRef.current) {
        if (id) dial(id);
      }
    }
    dialMissingRef.current = dialMissing;

    void import("peerjs").then(({ default: PeerCtor }) => {
      if (closed) return;
      peer = new PeerCtor(peerName(code, selfId), {
        host: "0.peerjs.com",
        port: 443,
        path: "/",
        secure: true,
        debug: 0,
        config: ICE,
      });
      peer.on("call", (call) => {
        const from = playerIdFromPeer(call.peer, wantedRef.current);
        const existing = calls.get(from);
        if (existing?.gotStream || remotesRef.current[from]) {
          try {
            call.close();
          } catch {
            /* already connected */
          }
          return;
        }
        call.answer(streamRef.current ?? undefined);
        watch(from, call);
      });
      peer.on("open", () => {
        if (!closed) dialMissing();
      });
      peer.on("disconnected", () => {
        if (!closed) peer?.reconnect();
      });
      peer.on("error", (error) => {
        const type = String((error as { type?: string }).type ?? error);
        if (type.includes("peer-unavailable") || type.includes("network") || type.includes("unavailable-id")) {
          for (const [id, entry] of calls) {
            if (!entry.gotStream) forget(id, entry.call);
          }
        }
      });
    });

    const retry = setInterval(() => {
      if (closed || !peer?.open) return;
      const stream = streamRef.current;
      if (stream) {
        for (const entry of calls.values()) pushTracks(entry.call, stream);
      }
      dialMissing();
    }, 3000);

    return () => {
      closed = true;
      clearInterval(retry);
      for (const entry of calls.values()) {
        try {
          entry.call.close();
        } catch {
          /* ignore */
        }
      }
      calls.clear();
      peer?.destroy();
      setRemoteStreams({});
    };
  }, [code, enabled, selfId]);

  useEffect(() => {
    if (!localStream) return;
    for (const entry of callsRef.current.values()) pushTracks(entry.call, localStream);
    dialMissingRef.current();
  }, [localStream]);

  return remoteStreams;
}
