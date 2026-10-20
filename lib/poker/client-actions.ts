import type { Player } from "@/types/player";
import type { PublicGameState, RoomSnapshot } from "@/types/room";
import { canAct, legalActions } from "./betting";

export function actionsForYou(snapshot: RoomSnapshot) {
  if (!snapshot.you || !snapshot.game) return [];
  if (snapshot.game.currentSeat !== snapshot.you.seatNumber) return [];
  return legalActions(
    snapshot.game as unknown as Parameters<typeof legalActions>[0],
    snapshot.you as unknown as Player,
  );
}

export function isYourTurn(snapshot: RoomSnapshot) {
  if (!snapshot.you || !snapshot.game) return false;
  return canAct(
    snapshot.game as unknown as Parameters<typeof canAct>[0],
    snapshot.you as unknown as Player,
  );
}

export function turnRemaining(game: PublicGameState, serverTimeOffset = 0) {
  const elapsed = (Date.now() + serverTimeOffset - game.turnStartedAt) / 1000;
  return Math.max(0, game.turnSeconds - elapsed);
}
