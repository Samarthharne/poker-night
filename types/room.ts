import type { Card, GamePhase, LegalAction, SidePot, Winner } from "./poker";
import type { Player, PublicPlayer } from "./player";

export type RoomStatus = "lobby" | "playing" | "paused" | "complete" | "closed";

export type ChatMessage = {
  id: string;
  playerId: string;
  displayName: string;
  message: string;
  createdAt: number;
};

export type GameState = {
  handNumber: number;
  dealerSeat: number;
  currentSeat: number | null;
  phase: GamePhase;
  pot: number;
  sidePots: SidePot[];
  communityCards: Card[];
  deck: Card[];
  minRaise: number;
  currentBet: number;
  lastRaiseSize: number;
  turnStartedAt: number;
  turnSeconds: number;
  winners: Winner[];
  lastAction?: string;
  paused: boolean;
};

export type Room = {
  id: string;
  roomCode: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  status: RoomStatus;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  closedAt: number | null;
  inviteHash: string;
  inviteSealed: string;
  inviteExpiresAt: number | null;
  players: Player[];
  game: GameState | null;
  messages: ChatMessage[];
  handHistory: string[];
};

export type PublicGameState = Omit<GameState, "deck"> & {
  deckRemaining: number;
  deck?: Card[];
};

export type RoomSnapshot = {
  id: string;
  roomCode: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  status: RoomStatus;
  locked: boolean;
  createdAt: number;
  players: PublicPlayer[];
  game: PublicGameState | null;
  messages: ChatMessage[];
  you: PublicPlayer | null;
  legalActions: LegalAction[];
  serverTime: number;
  connected: boolean;
};
