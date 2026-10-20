import type { Player } from "@/types/player";
import type { LegalAction } from "@/types/poker";

type BettingGame = {
  currentBet: number;
  lastRaiseSize: number;
  minRaise: number;
  currentSeat: number | null;
  paused: boolean;
  phase: string;
};

export function toCall(game: BettingGame, player: Player) {
  return Math.max(0, game.currentBet - player.currentBet);
}

export function legalActions(game: BettingGame, player: Player): LegalAction[] {
  if (player.folded || player.allIn || player.chipBalance < 0) return [];
  const call = toCall(game, player);
  const actions: LegalAction[] = [{ type: "fold" }];

  if (call === 0) {
    actions.push({ type: "check" });
    if (player.chipBalance > 0) {
      const minBet = Math.min(Math.max(game.minRaise, 1), player.chipBalance);
      actions.push({
        type: "bet",
        min: minBet,
        max: player.chipBalance,
      });
      if (player.chipBalance > 0) {
        actions.push({ type: "all-in", amount: player.chipBalance });
      }
    }
  } else {
    if (player.chipBalance > call) {
      actions.push({ type: "call", amount: call });
      const minRaiseTo = game.currentBet + game.minRaise;
      const maxRaiseTo = player.chipBalance + player.currentBet;
      if (maxRaiseTo > game.currentBet) {
        actions.push({
          type: "raise",
          min: Math.min(minRaiseTo, maxRaiseTo),
          max: maxRaiseTo,
        });
      }
      actions.push({ type: "all-in", amount: player.chipBalance });
    } else if (player.chipBalance > 0) {
      actions.push({ type: "call", amount: player.chipBalance });
      actions.push({ type: "all-in", amount: player.chipBalance });
    }
  }

  return uniqueActions(actions);
}

function uniqueActions(actions: LegalAction[]) {
  const seen = new Set<string>();
  return actions.filter((a) => {
    const key = `${a.type}:${a.amount ?? ""}:${a.min ?? ""}:${a.max ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function canAct(game: BettingGame, player: Player) {
  return (
    !game.paused &&
    game.currentSeat === player.seatNumber &&
    !player.folded &&
    !player.allIn &&
    game.phase !== "showdown" &&
    game.phase !== "waiting" &&
    game.phase !== "complete"
  );
}
