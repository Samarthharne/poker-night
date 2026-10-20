import { randomInt } from "crypto";
import type { Card } from "@/types/poker";

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function shuffledDeck(deck: Card[]): Card[] {
  return shuffle(deck);
}
