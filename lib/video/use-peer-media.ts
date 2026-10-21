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
  streamRef.current = localStream;
  selfRef.current = selfId;
  const peersKey = peerIds.slice().sort().join(",");

  useEffect(() => {
    if (!enabled || !code || !selfId) return;
    let closed = false;
    let peer: Peer | null = null;
    const calls = new Map<string, MediaConnection>();
    const wanted = peerIds.filter(Boolean);

    function publish(peerId: string, stream: MediaStream) {
      setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }));
    }

    function watch(peerId: string, call: MediaConnection) {
      calls.set(peerId, call);
      call.on("stream", (stream) => {
        if (!closed && stream.getTracks().length) publish(peerId, stream);
      });
      call.on("close", () => {
        calls.delete(peerId);
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      });
    }

    function dial(targetId: string) {
      if (!peer || closed || targetId === selfRef.current) return;
      const stream = streamRef.current;
      if (!stream) return;
      const existing = calls.get(targetId);
      if (existing && existing.open) return;
      try {
        existing?.close();
        const call = peer.call(peerName(code, targetId), stream);
        if (call) watch(targetId, call);
      } catch {
        /* peer not online yet */
      }
    }

    void import("peerjs").then(({ default: PeerCtor }) => {
      if (closed) return;
      const ice = rtcConfiguration();
      const iceServers: RTCIceServer[] = [
        ...(ice.iceServers ?? []),
        {
          urls: ["turn:0.peerjs.com:3478", "turn:0.peerjs.com:3478?transport=tcp"],
          username: "peerjs",
          credential: "peerjsp",
        },
      ];
      peer = new PeerCtor(peerName(code, selfId), {
        debug: 0,
        secure: true,
        config: { ...ice, iceServers },
      });
      peer.on("call", (call) => {
        const from = playerIdFromPeer(call.peer, wanted);
        call.answer(streamRef.current ?? undefined);
        watch(from, call);
      });
      peer.on("open", () => {
        for (const id of wanted) {
          if ((selfRef.current ?? "") < id) dial(id);
        }
      });
      peer.on("error", (error) => {
        if (String(error).includes("Could not connect") || String(error).includes("Lost connection")) {
          for (const id of wanted) dial(id);
        }
      });
    });

    const retry = setInterval(() => {
      if (closed || !peer) return;
      for (const id of wanted) {
        const hasRemote = Boolean(calls.get(id)?.open);
        if (!hasRemote) dial(id);
      }
    }, 2500);

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
  }, [code, enabled, localStream, peersKey, selfId, peerIds]);

  return remoteStreams;
}
