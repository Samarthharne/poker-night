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
    expect(snapshot.rtcMessages).toEqual([]);
  });

  it("only returns WebRTC messages addressed to the viewer", () => {
    const room = testRoom();
    const viewer = room.players[0]!;
    const other = room.players[1]!;
    room.rtcSignals = [
      {
        id: "for-you",
        from: other.id,
        to: viewer.id,
        type: "offer",
        sessionId: "s",
        createdAt: Date.now(),
        at: Date.now(),
        payload: { sdp: { type: "offer", sdp: "v=0" } },
      },
      {
        id: "for-them",
        from: viewer.id,
        to: other.id,
        type: "answer",
        sessionId: "s",
        createdAt: Date.now(),
        at: Date.now(),
        payload: { sdp: { type: "answer", sdp: "v=0" } },
      },
    ];
    const snapshot = toSnapshot(room, viewer.id);
    expect(snapshot.rtcMessages?.map((item) => item.id)).toEqual(["for-you"]);
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
