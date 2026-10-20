"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { eventsUrl, fetchRoom } from "@/lib/client/api";
import { emitVideoSignal } from "@/lib/video/signal-client";
import type { RoomSnapshot } from "@/types/room";

export function useRoomSync(code: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const apply = useCallback((next: RoomSnapshot) => {
    setSnapshot((prev) => {
      if (prev?.you && !next.you) {
        return { ...next, you: prev.you };
      }
      return next;
    });
    setConnected(true);
    setError(null);
  }, []);

  useEffect(() => {
    if (!enabled || !code) return;
    let cancelled = false;
    let source: EventSource | null = null;

    const boot = async () => {
      try {
        const data = await fetchRoom(code);
        if (!cancelled && data.snapshot) apply(data.snapshot);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load room.");
        }
      }
      if (cancelled) return;
      source = new EventSource(eventsUrl(code));
      source.onmessage = (event) => {
        try {
          apply(JSON.parse(event.data) as RoomSnapshot);
        } catch {
          /* ignore */
        }
      };
      source.addEventListener("signal", (event) => {
        try {
          emitVideoSignal(JSON.parse((event as MessageEvent).data));
        } catch {
          /* ignore */
        }
      });
      source.onerror = () => setConnected(false);
    };

    void boot();
    const beat = setInterval(() => {
      void fetchRoom(code)
        .then((data) => {
          if (!cancelled && data.snapshot) apply(data.snapshot);
        })
        .catch(() => undefined);
    }, 2000);

    return () => {
      cancelled = true;
      source?.close();
      clearInterval(beat);
    };
  }, [apply, code, enabled]);

  return { snapshot, setSnapshot, error, connected };
}
