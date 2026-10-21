"use client";

import { useMemo } from "react";
import type { PublicPlayer } from "@/types/player";
import type { RoomSnapshot } from "@/types/room";
import { CommunityCards } from "./CommunityCards";
import { SeatRing } from "./SeatRing";

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

export function PokerTable({
  snapshot,
  localStream,
  remoteStreams,
  speakerMuted,
  onSelectPlayer,
}: {
  snapshot: RoomSnapshot;
  localStream?: MediaStream | null;
  remoteStreams?: Record<string, MediaStream>;
  speakerMuted?: boolean;
  onSelectPlayer?: (id: string) => void;
}) {
  const { sb, bb } = blindsFor(snapshot);
  const winnerIds = useMemo(
    () => new Set(snapshot.game?.winners.map((w) => w.playerId) ?? []),
    [snapshot.game?.winners],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-1 [container-type:size] sm:p-2">
      <div
        className="felt-table wood-rail relative rounded-[999px]"
        style={{ width: "min(96cqw, calc(92cqh * 16 / 9))", aspectRatio: "16 / 9" }}
      >
        <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
          <CommunityCards
            cards={snapshot.game?.communityCards ?? []}
            pot={snapshot.game?.pot ?? 0}
            phase={snapshot.game?.phase ?? "waiting"}
          />
        </div>
        <SeatRing
          maxPlayers={snapshot.maxPlayers}
          players={snapshot.players}
          youId={snapshot.you?.id}
          dealerSeat={snapshot.game?.dealerSeat ?? null}
          smallBlindSeat={sb}
          bigBlindSeat={bb}
          currentSeat={
            snapshot.game?.paused || snapshot.status === "paused"
              ? null
              : snapshot.game?.currentSeat ?? null
          }
          localStream={localStream}
          remoteStreams={remoteStreams}
          speakerMuted={speakerMuted}
          showCardsFor={winnerIds}
          onSelectPlayer={onSelectPlayer}
        />
      </div>
    </div>
  );
}
