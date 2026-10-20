"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { eventsUrl, fetchRoom } from "@/lib/client/api";
import { emitVideoSignal } from "@/lib/video/signal-client";
import type { RoomSnapshot } from "@/types/room";

const PHASE_SCORE: Record<string, number> = {
  lobby: 0,
  waiting: 0,
  preflop: 1,
  flop: 2,
  turn: 3,
  river: 4,
  showdown: 5,
  complete: 6,
};

function progress(snapshot: RoomSnapshot | null) {
  if (!snapshot) return -1;
  if (snapshot.status === "lobby") return 0;
  const game = snapshot.game;
  if (!game) return 1;
  return (
    game.handNumber * 100_000 +
    (PHASE_SCORE[game.phase] ?? 0) * 1_000 +
    game.communityCards.length * 50 +
    (game.actionSeq ?? 0)
  );
}

export function useRoomSync(code: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const apply = useCallback((next: RoomSnapshot) => {
    setSnapshot((prev) => {
      const incoming = prev?.you && !next.you ? { ...next, you: prev.you } : next;
      if ((prev?.generation ?? 0) > (incoming.generation ?? 0)) {
        return prev;
      }
      if (
        incoming.status === "lobby" ||
        incoming.status === "closed" ||
        !incoming.game
      ) {
        return incoming;
      }
      if ((incoming.generation ?? 0) > (prev?.generation ?? 0)) {
        return incoming;
      }
      const prevScore = progress(prev);
      const nextScore = progress(incoming);
      if (prevScore > nextScore) return prev;
      return incoming;
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
