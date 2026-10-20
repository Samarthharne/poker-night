"use client";

import { useEffect } from "react";
import { heartbeatRoom } from "@/lib/client/api";
import { useRoomStore } from "@/lib/stores/room-store";

export function useRoomSync(code: string, token: string | null) {
  const setSnapshot = useRoomStore((s) => s.setSnapshot);
  const setConnected = useRoomStore((s) => s.setConnected);

  useEffect(() => {
    if (!token) return;
    const url = `/api/rooms/${code}/events?token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Parameters<typeof setSnapshot>[0] & {
          snapshot?: Parameters<typeof setSnapshot>[0];
        };
        const snap = data.snapshot ?? data;
        if (snap?.roomCode) {
          setSnapshot(snap);
          setConnected(true);
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    const beat = setInterval(() => {
      heartbeatRoom(code)
        .then((res) => {
          if (res.snapshot) setSnapshot(res.snapshot);
        })
        .catch(() => setConnected(false));
    }, 8000);
    return () => {
      source.close();
      clearInterval(beat);
    };
  }, [code, token, setConnected, setSnapshot]);
}
