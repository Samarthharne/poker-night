import { describe, expect, it } from "vitest";
import { bestOfSeven, compareHands } from "@/lib/poker/evaluator";
import { cards } from "../helpers/cards";

function hand(spec: string) {
  return bestOfSeven(cards(spec));
}

describe("hand evaluation", () => {
  it("ranks the ten Texas Hold'em categories in order", () => {
    const ranked = [
      hand("As Ks Qs Js Ts"),
      hand("9s 8s 7s 6s 5s"),
      hand("Ah Ad Ac As Kd"),
      hand("Kh Kd Kc 7s 7d"),
      hand("Ah Kh Qh 9h 2h"),
      hand("9c 8d 7h 6s 5c"),
      hand("Qs Qh Qd 9c 2s"),
      hand("As Ad Ks Kd 2c"),
      hand("Jh Jd 9c 4s 2d"),
      hand("As Kd 9c 5h 2s"),
    ];
    const names = [
      "Royal Flush",
      "Straight Flush",
      "Four of a Kind",
      "Full House",
      "Flush",
      "Straight",
      "Three of a Kind",
      "Two Pair",
      "One Pair",
      "High Card",
    ];
    expect(ranked.map((item) => item.name)).toEqual(names);
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(compareHands(ranked[i]!, ranked[i + 1]!)).toBeGreaterThan(0);
    }
  });

  it("treats a wheel as a five-high straight and an ace-high straight as higher", () => {
    const wheel = hand("As 5d 4c 3h 2s");
    const broadway = hand("As Kd Qc Jh Ts");
    expect(wheel).toMatchObject({ name: "Straight", tiebreak: [5] });
    expect(broadway).toMatchObject({ name: "Straight", tiebreak: [14] });
    expect(compareHands(broadway, wheel)).toBeGreaterThan(0);
  });

  it("uses kickers when the made hand is the same", () => {
    const aceKicker = hand("Kh Kd As 7c 2d");
    const queenKicker = hand("Ks Kc Qh 7d 2c");
    expect(aceKicker.name).toBe("One Pair");
    expect(compareHands(aceKicker, queenKicker)).toBeGreaterThan(0);
    expect(compareHands(aceKicker, hand("Kc Kd Ah 7s 2h"))).toBe(0);
  });

  it("picks the best five cards from seven", () => {
    const best = bestOfSeven(cards("Ah Ad As 9c 9d 2s 3c"));
    expect(best.name).toBe("Full House");
    expect(best.tiebreak).toEqual([14, 9]);
  });

  it("lets the board play when neither hole pair improves it", () => {
    const board = cards("Ah Kh Qh Jh Th 2c 3d");
    expect(bestOfSeven(board).name).toBe("Royal Flush");
  });

  it("ignores suit when two ordinary hands have the same ranks", () => {
    const hearts = hand("9h 9d 8c 4s 2d");
    const spades = hand("9s 9c 8d 4h 2c");
    expect(compareHands(hearts, spades)).toBe(0);
  });

  it("returns a defined hand for fewer than five cards instead of throwing", () => {
    expect(bestOfSeven(cards("As Kd")).name).toBe("High Card");
  });
});
