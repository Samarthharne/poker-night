import { describe, expect, it } from "vitest";
import { mergeRoomPair, mergeRooms } from "@/lib/store/durable";
import { endGame, startGame } from "@/lib/poker/game-engine";
import { testRoom } from "../helpers/room";

describe("room snapshot merge", () => {
  it("keeps a later street instead of an older flop from another instance", () => {
    const flop = testRoom();
    startGame(flop);
    flop.game!.phase = "flop";
    flop.game!.communityCards = [
      { rank: "A", suit: "s" },
      { rank: "K", suit: "h" },
      { rank: "2", suit: "d" },
    ];
    flop.game!.actionSeq = 4;
    flop.updatedAt = 10;

    const river = structuredClone(flop);
    river.game!.phase = "river";
    river.game!.communityCards = [
      ...flop.game!.communityCards,
      { rank: "9", suit: "c" },
      { rank: "3", suit: "s" },
    ];
    river.game!.actionSeq = 8;
    river.updatedAt = 1;

    const merged = mergeRoomPair(flop, river);
    expect(merged.game?.phase).toBe("river");
    expect(merged.game?.communityCards).toHaveLength(5);
  });

  it("lets End game lobby beat a stale playing copy even if playing is newer", () => {
    const playing = testRoom();
    startGame(playing);
    playing.updatedAt = Date.now();

    const lobby = structuredClone(playing);
    endGame(lobby);
    lobby.updatedAt = playing.updatedAt - 5_000;

    const merged = mergeRoomPair(playing, lobby);
    expect(merged.status).toBe("lobby");
    expect(merged.game).toBeNull();
    expect(merged.players.every((player) => !player.holeCards)).toBe(true);
  });

  it("prefers the higher generation when start and end race", () => {
    const older = testRoom();
    startGame(older);
    const newer = structuredClone(older);
    endGame(newer);
    newer.generation = (older.generation ?? 0) + 3;
    const merged = mergeRoomPair(older, newer);
    expect(merged.generation).toBe(newer.generation);
    expect(merged.status).toBe("lobby");
  });

  it("keeps WebRTC offers from both instances", () => {
    const left = testRoom();
    const right = structuredClone(left);
    left.rtcSignals = [
      {
        id: "offer-a",
        from: "a",
        to: "b",
        type: "offer",
        sessionId: "s",
        createdAt: Date.now(),
        at: Date.now(),
        payload: { sdp: { type: "offer", sdp: "v=0" } },
      },
    ];
    right.rtcSignals = [
      {
        id: "answer-b",
        from: "b",
        to: "a",
        type: "answer",
        sessionId: "s",
        createdAt: Date.now(),
        at: Date.now(),
        payload: { sdp: { type: "answer", sdp: "v=0" } },
      },
    ];
    const merged = mergeRoomPair(left, right);
    expect(merged.rtcSignals?.map((item) => item.id).sort()).toEqual(["answer-b", "offer-a"]);
  });

  it("unions rooms from two instances by id", () => {
    const a = testRoom(["Ava", "Ben"]);
    const b = testRoom(["Cam", "Dee"]);
    b.id = "other";
    const merged = mergeRooms([a], [b]);
    expect(merged.map((room) => room.id).sort()).toEqual([a.id, b.id].sort());
  });
});
