"use client";

import { initials } from "@/lib/utils";
import type { RoomSnapshot } from "@/types/room";
import { PlayerSeat } from "@/components/poker/PlayerSeat";

export function Lobby({
  snapshot,
  localStream,
  remoteStreams,
  localId,
  speakerMuted,
  onFrame,
  onAudioBlocked,
}: {
  snapshot: RoomSnapshot;
  onUpdate?: (s: RoomSnapshot) => void;
  localStream: MediaStream | null;
  remoteStreams?: Record<string, MediaStream>;
  localId?: string;
  speakerMuted?: boolean;
  isAdmin?: boolean;
  hostCode?: string;
  onFrame?: (playerId: string, ready: boolean) => void;
  onAudioBlocked?: (blocked: boolean) => void;
}) {
  const seats = Array.from({ length: Math.max(snapshot.maxPlayers, 6) }, (_, i) => i + 1);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-3 overflow-hidden px-3 py-3">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold/70">Waiting room</p>
        <h1 className="font-display text-3xl">{snapshot.name}</h1>
        <p className="text-white/60">
          {snapshot.players.length}/{snapshot.maxPlayers} seated · Blinds {snapshot.smallBlind}/{snapshot.bigBlind}
        </p>
      </div>

      <div className="felt-table wood-rail mx-auto h-24 w-full max-w-xl shrink-0 rounded-[999px] sm:h-28" />
      <div className="grid max-h-[52vh] min-h-[220px] flex-1 grid-cols-2 content-start gap-2 overflow-y-scroll px-1 pb-8 sm:grid-cols-3">
        {seats.map((seat) => {
          const player = snapshot.players.find((item) => item.seatNumber === seat);
          if (!player) {
            return (
              <div
                key={seat}
                className="flex min-h-[110px] items-center justify-center rounded-2xl border border-dashed border-white/20 bg-black/25 text-center text-xs text-white/40"
              >
                Seat {seat}
                <span className="ml-1 block sm:inline">Empty</span>
              </div>
            );
          }
          return (
            <div key={player.id} className="flex justify-center">
              <PlayerSeat
                player={player}
                dealerSeat={null}
                smallBlindSeat={null}
                bigBlindSeat={null}
                isTurn={false}
                compact
                localStream={player.id === localId ? localStream : null}
                remoteStream={remoteStreams?.[player.id] ?? null}
                isYou={player.id === localId}
                speakerMuted={speakerMuted}
                onFrame={(ready) => onFrame?.(player.id, ready)}
                onAudioBlocked={onAudioBlocked}
              />
            </div>
          );
        })}
      </div>

      <p className="shrink-0 pb-4 text-center text-sm text-white/55">
        Waiting for the administrator to start the game from the dashboard.
      </p>
    </div>
  );
}

export function EmptyInitials({ name }: { name: string }) {
  return <span>{initials(name)}</span>;
}
