import { describe, expect, it } from "vitest";
import {
  applyAction,
  endGame,
  pauseGame,
  startGame,
} from "@/lib/poker/game-engine";
import { legalActions } from "@/lib/poker/betting";
import { testRoom, stackTotal } from "../helpers/room";

describe("game engine", () => {
  it("refuses to start with fewer than two stacks", () => {
    const room = testRoom(["Ava"]);
    expect(() => startGame(room)).toThrow(/at least 2 players/i);
  });

  it("starts a hand with blinds, two hole cards, and a shared seeded deck", () => {
    const first = testRoom();
    const second = testRoom();
    startGame(first);
    startGame(second);
    expect(first.status).toBe("playing");
    expect(first.game?.phase).toBe("preflop");
    expect(first.game?.handNumber).toBe(1);
    expect(first.players.every((player) => player.holeCards?.length === 2)).toBe(true);
    expect(first.game?.communityCards).toEqual([]);
    expect(first.players[0]!.holeCards).toEqual(second.players[0]!.holeCards);
    expect(first.game?.deck).toEqual(second.game?.deck);
    expect(stackTotal(first)).toBe(first.startingChips * first.players.length);
  });

  it("lets the first actor fold and awards the pot without staying on the felt", () => {
    const room = testRoom();
    startGame(room);
    const actor = room.players.find((player) => player.seatNumber === room.game?.currentSeat);
    expect(actor).toBeTruthy();
    applyAction(room, actor!.id, "fold");
    expect(room.game?.phase).toBe("showdown");
    expect(room.game?.winners.length).toBeGreaterThan(0);
    expect(stackTotal(room)).toBe(room.startingChips * room.players.length);
  });

  it("checks when nothing is owed and keeps chips in the stack", () => {
    const room = testRoom();
    startGame(room);
    const actor = room.players.find((player) => player.seatNumber === room.game?.currentSeat)!;
    const call = legalActions(room.game!, actor).find((action) => action.type === "call");
    if (call) applyAction(room, actor.id, "call");
    const next = room.players.find((player) => player.seatNumber === room.game?.currentSeat);
    if (next && legalActions(room.game!, next).some((action) => action.type === "check")) {
      const chips = next.chipBalance;
      applyAction(room, next.id, "check");
      expect(next.chipBalance).toBe(chips);
      expect(room.game?.lastAction).toMatch(/checks/);
    }
  });

  it("pauses and resumes without dealing a new street", () => {
    const room = testRoom();
    startGame(room);
    const phase = room.game!.phase;
    const board = room.game!.communityCards.length;
    pauseGame(room, true);
    expect(room.status).toBe("paused");
    expect(room.game?.paused).toBe(true);
    expect(room.game?.lastAction).toBe("Game paused");
    expect(() => applyAction(room, room.players[0]!.id, "fold")).toThrow();
    pauseGame(room, false);
    expect(room.status).toBe("playing");
    expect(room.game?.paused).toBe(false);
    expect(room.game?.phase).toBe(phase);
    expect(room.game?.communityCards).toHaveLength(board);
  });

  it("end game returns everyone to the waiting room and restores stacks", () => {
    const room = testRoom();
    startGame(room);
    const generation = room.generation;
    endGame(room);
    expect(room.status).toBe("lobby");
    expect(room.game).toBeNull();
    expect(room.generation).toBe(generation + 1);
    expect(room.players.every((player) => player.chipBalance === room.startingChips)).toBe(true);
    expect(room.players.every((player) => !player.holeCards)).toBe(true);
  });
});
