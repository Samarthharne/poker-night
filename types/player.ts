import type { Card } from "./poker";

export type Player = {
  id: string;
  token: string;
  sessionId: string;
  displayName: string;
  seatNumber: number;
  chipBalance: number;
  currentBet: number;
  totalBetThisHand: number;
  isHost: boolean;
  isConnected: boolean;
  lastSeenAt: number;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  folded: boolean;
  allIn: boolean;
  holeCards?: [Card, Card];
  hasActedThisRound: boolean;
  isReady: boolean;
  contributedThisHand: number;
  removed?: boolean;
};

export type PublicPlayer = Omit<Player, "token" | "holeCards"> & {
  holeCards?: [Card, Card] | null;
  hasCards: boolean;
};
