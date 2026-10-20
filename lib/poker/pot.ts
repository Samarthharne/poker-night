import type { Player } from "@/types/player";
import type { SidePot } from "@/types/poker";

export function buildSidePots(players: Player[]): SidePot[] {
  const contributors = players.filter((p) => p.contributedThisHand > 0);
  if (contributors.length === 0) return [];

  const levels = [
    ...new Set(contributors.map((p) => p.contributedThisHand)),
  ].sort((a, b) => a - b);

  const pots: SidePot[] = [];
  let prev = 0;
  for (const level of levels) {
    const eligible = contributors.filter((p) => p.contributedThisHand >= level);
    const amount = (level - prev) * eligible.length;
    const winnersEligible = eligible
      .filter((p) => !p.folded)
      .map((p) => p.id);
    if (amount > 0) {
      pots.push({ amount, eligiblePlayerIds: winnersEligible });
    }
    prev = level;
  }
  return pots;
}

export function totalPot(pots: SidePot[]) {
  return pots.reduce((sum, pot) => sum + pot.amount, 0);
}
