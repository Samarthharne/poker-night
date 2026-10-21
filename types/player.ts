import type { Card } from "./poker";

export type PlayerRtcSignal = {
  id: string;
  type: "offer" | "answer" | "ice-restart";
  to: string;
  sessionId: string;
  sdp: string;
  sdpType: string;
  at: number;
};

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
  rtcSignal?: PlayerRtcSignal;
};

export type PublicPlayer = Omit<Player, "token" | "holeCards"> & {
  holeCards?: [Card, Card] | null;
  hasCards: boolean;
};
