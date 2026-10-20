import { createPlayer } from "@/lib/store/player-factory";
import type { Room } from "@/types/room";

export function testRoom(names: string[] = ["Ava", "Ben"], chips = 1000): Room {
  return {
    id: `room-${names.join("-")}`,
    roomCode: "TEST01",
    name: "Test Table",
    hostId: "",
    maxPlayers: 6,
    startingChips: chips,
    smallBlind: 10,
    bigBlind: 20,
    status: "lobby",
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: null,
    closedAt: null,
    inviteHash: "",
    inviteSealed: "",
    inviteExpiresAt: null,
    players: names.map((displayName, index) =>
      createPlayer({
        displayName,
        sessionId: `session-${index}`,
        seatNumber: index + 1,
        chipBalance: chips,
        isHost: false,
      }),
    ),
    game: null,
    messages: [],
    handHistory: [],
  };
}

export function stackTotal(room: Room) {
  const inPockets = room.players.reduce((sum, player) => sum + player.chipBalance, 0);
  return inPockets + (room.game?.pot ?? 0);
}
