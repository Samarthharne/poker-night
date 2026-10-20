import { describe, expect, it } from "vitest";
import { canAct, legalActions, toCall } from "@/lib/poker/betting";
import { createPlayer } from "@/lib/store/player-factory";

function player(chips: number, currentBet = 0) {
  const seated = createPlayer({
    displayName: "Ada",
    sessionId: "s",
    seatNumber: 1,
    chipBalance: chips,
    isHost: false,
  });
  seated.currentBet = currentBet;
  return seated;
}

const open = {
  currentBet: 20,
  lastRaiseSize: 20,
  minRaise: 20,
  currentSeat: 1,
  paused: false,
  phase: "preflop",
};

describe("legal betting actions", () => {
  it("offers check and bet when nothing is owed", () => {
    const game = { ...open, currentBet: 0 };
    const actor = player(500);
    expect(toCall(game, actor)).toBe(0);
    expect(legalActions(game, actor).map((action) => action.type)).toEqual([
      "fold",
      "check",
      "bet",
      "all-in",
    ]);
  });

  it("offers call and raise when facing a bet the player can cover", () => {
    const actor = player(500, 0);
    const types = legalActions(open, actor).map((action) => action.type);
    expect(types).toContain("call");
    expect(types).toContain("raise");
    const raise = legalActions(open, actor).find((action) => action.type === "raise");
    expect(raise?.min).toBe(40);
    expect(raise?.max).toBe(500);
  });

  it("turns a short stack into a call for the remaining chips", () => {
    const actor = player(15, 0);
    const actions = legalActions(open, actor);
    expect(actions.find((action) => action.type === "call")?.amount).toBe(15);
    expect(actions.some((action) => action.type === "raise")).toBe(false);
  });

  it("returns no actions after a fold or all-in", () => {
    const folded = player(100);
    folded.folded = true;
    const allIn = player(0);
    allIn.allIn = true;
    expect(legalActions(open, folded)).toEqual([]);
    expect(legalActions(open, allIn)).toEqual([]);
  });

  it("blocks action out of turn, while paused, and after the hand is over", () => {
    const actor = player(100);
    expect(canAct({ ...open, currentSeat: 2 }, actor)).toBe(false);
    expect(canAct({ ...open, paused: true }, actor)).toBe(false);
    expect(canAct({ ...open, phase: "complete" }, actor)).toBe(false);
    expect(canAct({ ...open, phase: "showdown" }, actor)).toBe(false);
    expect(canAct(open, actor)).toBe(true);
  });
});
