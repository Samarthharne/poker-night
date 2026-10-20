import { describe, expect, it } from "vitest";
import { buildSidePots, totalPot } from "@/lib/poker/pot";
import type { Player } from "@/types/player";
import { createPlayer } from "@/lib/store/player-factory";

function contributor(name: string, seat: number, contributed: number, folded = false): Player {
  const player = createPlayer({
    displayName: name,
    sessionId: name,
    seatNumber: seat,
    chipBalance: 0,
    isHost: false,
  });
  player.contributedThisHand = contributed;
  player.folded = folded;
  return player;
}

describe("side pots", () => {
  it("builds a main pot and a side pot when stacks differ", () => {
    const players = [
      contributor("Short", 1, 100),
      contributor("Middle", 2, 300),
      contributor("Deep", 3, 300),
    ];
    const pots = buildSidePots(players);
    expect(totalPot(pots)).toBe(700);
    expect(pots[0]).toEqual({
      amount: 300,
      eligiblePlayerIds: [players[0]!.id, players[1]!.id, players[2]!.id],
    });
    expect(pots[1]).toEqual({
      amount: 400,
      eligiblePlayerIds: [players[1]!.id, players[2]!.id],
    });
  });

  it("excludes a folded player from eligibility but keeps their chips in the pot", () => {
    const folded = contributor("Folded", 1, 50, true);
    const winner = contributor("Live", 2, 50);
    const pots = buildSidePots([folded, winner]);
    expect(totalPot(pots)).toBe(100);
    expect(pots[0]!.eligiblePlayerIds).toEqual([winner.id]);
  });

  it("returns no pots when nobody has contributed", () => {
    const player = contributor("Idle", 1, 0);
    expect(buildSidePots([player])).toEqual([]);
  });
});
