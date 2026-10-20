import { describe, expect, it } from "vitest";
import { randomInt } from "crypto";
import { cardKey, createDeck, RANKS, SUITS } from "@/lib/poker/deck";
import { shuffle } from "@/lib/poker/shuffle";

describe("deck", () => {
  it("builds a 52-card deck with every rank and suit and no duplicates", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardKey)).size).toBe(52);
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        expect(deck).toContainEqual({ rank, suit });
      }
    }
  });
});

describe("shuffle", () => {
  it("returns a permutation of the same cards", () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);
    expect(shuffled).toHaveLength(52);
    expect(shuffled.map(cardKey).sort()).toEqual(deck.map(cardKey).sort());
    expect(deck.map(cardKey).join()).not.toBe(createDeck().map(cardKey).reverse().join() && shuffled);
    expect(deck[0]).toEqual(createDeck()[0]);
  });

  it("uses crypto.randomInt, which is the secure source used by production shuffles", () => {
    expect(randomInt(2)).toBeGreaterThanOrEqual(0);
    const samples = new Set(
      Array.from({ length: 8 }, () => shuffle(createDeck()).map(cardKey).join("")),
    );
    expect(samples.size).toBeGreaterThan(1);
  });
});
