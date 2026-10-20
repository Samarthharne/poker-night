import type { Card, Rank, Suit } from "@/types/poker";

export const SUITS: Suit[] = ["s", "h", "d", "c"];
export const RANKS: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function cardKey(card: Card) {
  return `${card.rank}${card.suit}`;
}
