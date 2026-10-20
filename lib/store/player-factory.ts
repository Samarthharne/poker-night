import { customAlphabet } from "nanoid";
import type { Player } from "@/types/player";

const tokenNano = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 32);

export function createPlayer(input: {
  displayName: string;
  sessionId: string;
  seatNumber: number;
  chipBalance: number;
  isHost: boolean;
}): Player {
  return {
    id: crypto.randomUUID(),
    token: tokenNano(),
    sessionId: input.sessionId,
    displayName: input.displayName,
    seatNumber: input.seatNumber,
    chipBalance: input.chipBalance,
    currentBet: 0,
    totalBetThisHand: 0,
    isHost: input.isHost,
    isConnected: true,
    lastSeenAt: Date.now(),
    cameraEnabled: false,
    microphoneEnabled: false,
    folded: false,
    allIn: false,
    hasActedThisRound: false,
    isReady: true,
    contributedThisHand: 0,
    removed: false,
  };
}

export function nextSeat(occupied: number[], maxPlayers: number) {
  for (let seat = 1; seat <= maxPlayers; seat++) {
    if (!occupied.includes(seat)) return seat;
  }
  return null;
}
