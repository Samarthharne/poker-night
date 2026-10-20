import type { Card, Rank, Suit } from "@/types/poker";

export function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

export function cards(spec: string): Card[] {
  return spec.split(/\s+/).filter(Boolean).map((token) => {
    const rank = token.slice(0, -1) as Rank;
    const suit = token.slice(-1) as Suit;
    return card(rank, suit);
  });
}
