"use client";

import { useMemo } from "react";
import type { PublicPlayer } from "@/types/player";
import type { RoomSnapshot } from "@/types/room";
import { PlayerSeat } from "./PlayerSeat";
import { CommunityCards } from "./CommunityCards";

function nextSeat(players: PublicPlayer[], from: number) {
  const seated = [...players].sort((a, b) => a.seatNumber - b.seatNumber);
  return seated.find((p) => p.seatNumber > from)?.seatNumber ?? seated[0]?.seatNumber ?? null;
}

export function blindsFor(snapshot: RoomSnapshot) {
  const live = snapshot.players.filter((p) => p.chipBalance > 0 || p.hasCards);
  if (!snapshot.game || live.length < 2) {
    return { sb: null as number | null, bb: null as number | null };
  }
  const dealer = snapshot.game.dealerSeat;
  const headsUp = live.length === 2;
  const sb = headsUp ? dealer : nextSeat(live, dealer);
  const bb = sb != null ? nextSeat(live, sb) : null;
  return { sb, bb };
}

function polar(angle: number, rx: number, ry: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    left: `${50 + Math.cos(rad) * rx}%`,
    top: `${50 + Math.sin(rad) * ry}%`,
  };
}

export function PokerTable({
  snapshot,
  localStream,
  remoteStreams,
  onSelectPlayer,
}: {
  snapshot: RoomSnapshot;
  localStream?: MediaStream | null;
  remoteStreams?: Record<string, MediaStream>;
  onSelectPlayer?: (id: string) => void;
}) {
  const you = snapshot.you;
  const players = [...snapshot.players].sort((a, b) => a.seatNumber - b.seatNumber);
  const selfIndex = Math.max(
    0,
    players.findIndex((p) => p.id === you?.id),
  );
  const { sb, bb } = blindsFor(snapshot);
  const winnerIds = useMemo(
    () => new Set(snapshot.game?.winners.map((w) => w.playerId) ?? []),
    [snapshot.game?.winners],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-1 [container-type:size] sm:p-2">
      <div
        className="felt-table wood-rail relative rounded-[999px]"
        style={{ width: "min(92cqw, calc(88cqh * 16 / 9))", aspectRatio: "16 / 9" }}
      >
        <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
          <CommunityCards
            cards={snapshot.game?.communityCards ?? []}
            pot={snapshot.game?.pot ?? 0}
            phase={snapshot.game?.phase ?? "waiting"}
          />
        </div>
        {players.map((player, i) => {
          const relative = (i - selfIndex + players.length) % Math.max(players.length, 1);
          const angle = 90 + relative * (360 / Math.max(players.length, 1));
          const pos = polar(angle, 30, 26);
          return (
            <div
              key={player.id}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={pos}
            >
              <PlayerSeat
                player={player}
                dealerSeat={snapshot.game?.dealerSeat ?? null}
                smallBlindSeat={sb}
                bigBlindSeat={bb}
                isTurn={snapshot.game?.currentSeat === player.seatNumber}
                fitted
                localStream={player.id === you?.id ? localStream : null}
                remoteStream={remoteStreams?.[player.id] ?? null}
                showCards={player.id === you?.id || winnerIds.has(player.id)}
                isYou={player.id === you?.id}
                onExpand={() => {
                  onSelectPlayer?.(player.id);
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
