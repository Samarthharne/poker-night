"use client";

import { useEffect, useRef, useState } from "react";
import type Peer from "peerjs";
import type { MediaConnection } from "peerjs";
import { rtcConfiguration } from "./ice";

function peerName(code: string, playerId: string) {
  const room = code.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return `p${room}${playerId.replace(/-/g, "")}`;
}

function playerIdFromPeer(name: string, peerIds: string[]) {
  return (
    peerIds.find((id) => name.endsWith(id.replace(/-/g, ""))) ??
    name.replace(/^p[a-zA-Z0-9]{0,8}/, "")
  );
}

function peerIce(): RTCConfiguration {
  const ice = rtcConfiguration();
  const iceServers: RTCIceServer[] = [
    ...(ice.iceServers ?? []),
    {
      urls: ["turn:0.peerjs.com:3478", "turn:0.peerjs.com:3478?transport=tcp"],
      username: "peerjs",
      credential: "peerjsp",
    },
  ];
  return { ...ice, iceServers };
}

function pushTracks(call: MediaConnection, stream: MediaStream) {
  const pc = call.peerConnection;
  if (!pc) return;
  for (const sender of pc.getSenders()) {
    const next = stream.getTracks().find((track) => track.kind === sender.track?.kind);
    if (next && sender.track && next.id !== sender.track.id) {
      void sender.replaceTrack(next);
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
  const callsRef = useRef(new Map<string, MediaConnection>());
  const dialMissingRef = useRef<(force?: boolean) => void>(() => undefined);
  streamRef.current = localStream;
  selfRef.current = selfId;
  wantedRef.current = peerIds;

  useEffect(() => {
    if (!enabled || !code || !selfId) return;
    let closed = false;
    let peer: Peer | null = null;
    const calls = callsRef.current;
    calls.clear();

    function publish(peerId: string, stream: MediaStream) {
      setRemoteStreams((prev) => (prev[peerId] === stream ? prev : { ...prev, [peerId]: stream }));
    }

    function forget(peerId: string, call: MediaConnection) {
      if (calls.get(peerId) !== call) return;
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
      if (prev && prev !== call) {
        try {
          prev.close();
        } catch {
          /* ignore */
        }
      }
      calls.set(peerId, call);
      call.on("stream", (stream) => {
        if (closed) return;
        if (stream.getTracks().some((track) => track.readyState !== "ended")) {
          publish(peerId, stream);
        }
      });
      call.on("close", () => forget(peerId, call));
      call.on("error", () => forget(peerId, call));
    }

    function dial(targetId: string, force = false) {
      if (!peer?.open || closed || targetId === selfRef.current) return;
      const stream = streamRef.current;
      if (!stream) return;
      if (calls.has(targetId)) return;
      if (!force && (selfRef.current ?? "") >= targetId) return;
      try {
        const call = peer.call(peerName(code, targetId), stream);
        if (call) watch(targetId, call);
      } catch {
        /* other player has not opened a PeerJS id yet */
      }
    }

    function dialMissing(force = false) {
      for (const id of wantedRef.current) {
        if (id) dial(id, force);
      }
    }
    dialMissingRef.current = dialMissing;

    void import("peerjs").then(({ default: PeerCtor }) => {
      if (closed) return;
      peer = new PeerCtor(peerName(code, selfId), {
        debug: 0,
        secure: true,
        config: peerIce(),
      });
      peer.on("call", (call) => {
        const from = playerIdFromPeer(call.peer, wantedRef.current);
        const existing = calls.get(from);
        if (existing?.open) {
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
        if (type.includes("peer-unavailable") || type.includes("network")) {
          for (const [id, call] of calls) {
            if (!call.open) forget(id, call);
          }
        }
      });
    });

    const retry = setInterval(() => {
      if (closed || !peer?.open) return;
      const stream = streamRef.current;
      if (stream) {
        for (const call of calls.values()) pushTracks(call, stream);
      }
      dialMissing(true);
    }, 5000);

    return () => {
      closed = true;
      clearInterval(retry);
      for (const call of calls.values()) {
        try {
          call.close();
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
    for (const call of callsRef.current.values()) pushTracks(call, localStream);
    dialMissingRef.current();
  }, [localStream]);

  return remoteStreams;
}
