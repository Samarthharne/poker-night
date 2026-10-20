"use client";

import type { RoomSnapshot } from "@/types/room";

export function DebugPanel({
  snapshot,
  connected,
}: {
  snapshot: RoomSnapshot;
  connected: boolean;
}) {
  if (process.env.NODE_ENV === "production") return null;
  const game = snapshot.game;
  return (
    <div className="fixed bottom-2 left-2 z-40 max-w-[220px] rounded-xl border border-white/10 bg-black/80 p-2 font-mono text-[10px] text-white/80">
      <p>Room {snapshot.roomCode}</p>
      <p>Phase {game?.phase ?? snapshot.status}</p>
      <p>Dealer {game?.dealerSeat ?? "-"}</p>
      <p>Current {game?.currentSeat ?? "-"}</p>
      <p>Pot {game?.pot ?? 0}</p>
      <p>Deck {game?.deckRemaining ?? "-"}</p>
      <p>Players {snapshot.players.filter((p) => p.isConnected).length}</p>
      <p>Realtime {connected ? "yes" : "no"}</p>
    </div>
  );
}
