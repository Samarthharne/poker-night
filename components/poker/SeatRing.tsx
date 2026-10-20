"use client";

import type { PublicPlayer } from "@/types/player";
import { PlayerSeat } from "./PlayerSeat";

function polar(angle: number, rx: number, ry: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    left: `${50 + Math.cos(rad) * rx}%`,
    top: `${50 + Math.sin(rad) * ry}%`,
  };
}

export function SeatRing({
  maxPlayers,
  players,
  youId,
  dealerSeat,
  smallBlindSeat,
  bigBlindSeat,
  currentSeat,
  localStream,
  remoteStreams,
  showCardsFor,
  onSelectPlayer,
  onKick,
  canKick,
}: {
  maxPlayers: number;
  players: PublicPlayer[];
  youId?: string;
  dealerSeat?: number | null;
  smallBlindSeat?: number | null;
  bigBlindSeat?: number | null;
  currentSeat?: number | null;
  localStream?: MediaStream | null;
  remoteStreams?: Record<string, MediaStream>;
  showCardsFor?: Set<string>;
  onSelectPlayer?: (id: string) => void;
  onKick?: (playerId: string) => void;
  canKick?: boolean;
}) {
  const seats = Math.max(maxPlayers, 2);
  const selfSeat = players.find((player) => player.id === youId)?.seatNumber ?? 1;

  return (
    <>
      {Array.from({ length: seats }, (_, index) => index + 1).map((seatNumber) => {
        const player = players.find((item) => item.seatNumber === seatNumber);
        const relative = (seatNumber - selfSeat + seats) % seats;
        const pos = polar(90 + relative * (360 / seats), 38, 34);
        return (
          <div
            key={seatNumber}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={pos}
          >
            {player ? (
              <div className="flex flex-col items-center gap-1">
                <PlayerSeat
                  player={player}
                  dealerSeat={dealerSeat ?? null}
                  smallBlindSeat={smallBlindSeat ?? null}
                  bigBlindSeat={bigBlindSeat ?? null}
                  isTurn={currentSeat === player.seatNumber}
                  fitted
                  localStream={player.id === youId ? localStream : null}
                  remoteStream={remoteStreams?.[player.id] ?? null}
                  showCards={player.id === youId || Boolean(showCardsFor?.has(player.id))}
                  isYou={player.id === youId}
                  onExpand={() => onSelectPlayer?.(player.id)}
                />
                {canKick && onKick && !player.isHost && player.id !== youId && (
                  <button
                    type="button"
                    className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70"
                    onClick={() => onKick(player.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ) : (
              <div className="grid h-[88px] w-[112px] place-items-center rounded-2xl border border-dashed border-white/20 bg-black/25 text-center text-[11px] text-white/40 sm:h-[108px] sm:w-[140px]">
                Seat {seatNumber}
                <span className="block text-white/30">Empty</span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
