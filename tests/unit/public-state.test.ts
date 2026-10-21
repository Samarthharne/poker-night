import { describe, expect, it } from "vitest";
import { toSnapshot } from "@/lib/poker/public-state";
import { endGame, startGame } from "@/lib/poker/game-engine";
import { isYourTurn } from "@/lib/poker/client-actions";
import { testRoom } from "../helpers/room";

describe("public snapshot", () => {
  it("hides the deck and never marks an invitee as host", () => {
    const room = testRoom();
    startGame(room);
    const viewer = room.players[0]!;
    const snapshot = toSnapshot(room, viewer.id);
    expect(snapshot.game?.deck).toBeUndefined();
    expect(snapshot.players.every((player) => player.isHost === false)).toBe(true);
    expect(snapshot.you?.holeCards).toHaveLength(2);
    const other = snapshot.players.find((player) => player.id !== viewer.id);
    expect(other?.holeCards).toBeNull();
  });

  it("reports lobby after end game even if status lagged", () => {
    const room = testRoom();
    startGame(room);
    endGame(room);
    room.status = "playing";
    const snapshot = toSnapshot(room, room.players[0]!.id);
    expect(snapshot.status).toBe("lobby");
    expect(snapshot.game).toBeNull();
    expect(isYourTurn(snapshot)).toBe(false);
  });
});
