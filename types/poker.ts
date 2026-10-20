export type Suit = "s" | "h" | "d" | "c";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A";

export type Card = {
  rank: Rank;
  suit: Suit;
};

export type GamePhase =
  | "waiting"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "complete";

export type PokerActionType =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "all-in";

export type LegalAction = {
  type: PokerActionType;
  amount?: number;
  min?: number;
  max?: number;
};

export type HandRankName =
  | "Royal Flush"
  | "Straight Flush"
  | "Four of a Kind"
  | "Full House"
  | "Flush"
  | "Straight"
  | "Three of a Kind"
  | "Two Pair"
  | "One Pair"
  | "High Card";

export type SidePot = {
  amount: number;
  eligiblePlayerIds: string[];
};

export type Winner = {
  playerId: string;
  displayName: string;
  amount: number;
  handName: HandRankName | "Win";
};

export type EvaluatedHand = {
  rank: number;
  name: HandRankName;
  tiebreak: number[];
};
