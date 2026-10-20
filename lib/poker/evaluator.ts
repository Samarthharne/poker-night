import type { Card, EvaluatedHand, HandRankName, Rank } from "@/types/poker";

const RANK_VALUE: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export function compareHands(a: EvaluatedHand, b: EvaluatedHand) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const diff = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function bestOfSeven(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    return { rank: 0, name: "High Card", tiebreak: [0] };
  }
  if (cards.length === 5) return evaluateFive(cards);
  const combos = combinations(cards, 5);
  let best = evaluateFive(combos[0]!);
  for (let i = 1; i < combos.length; i++) {
    const next = evaluateFive(combos[i]!);
    if (compareHands(next, best) > 0) best = next;
  }
  return best;
}

function combinations(cards: Card[], k: number): Card[][] {
  const result: Card[][] = [];
  const walk = (start: number, chosen: Card[]) => {
    if (chosen.length === k) {
      result.push([...chosen]);
      return;
    }
    for (let i = start; i < cards.length; i++) {
      chosen.push(cards[i]!);
      walk(i + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);
  return result;
}

function evaluateFive(cards: Card[]): EvaluatedHand {
  const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const flush = suits.every((s) => s === suits[0]);
  const { counts, uniqueDesc } = rankCounts(values);
  const straightHigh = straightHighFrom(uniqueDesc);
  const isStraight = straightHigh !== null;

  if (flush && isStraight && straightHigh === 14 && uniqueDesc.includes(13)) {
    return named(9, "Royal Flush", [14]);
  }
  if (flush && isStraight) {
    return named(8, "Straight Flush", [straightHigh!]);
  }
  if (counts[0]?.[0] === 4) {
    return named(7, "Four of a Kind", [counts[0][1], counts[1]![1]]);
  }
  if (counts[0]?.[0] === 3 && counts[1]?.[0] === 2) {
    return named(6, "Full House", [counts[0][1], counts[1][1]]);
  }
  if (flush) {
    return named(5, "Flush", values);
  }
  if (isStraight) {
    return named(4, "Straight", [straightHigh!]);
  }
  if (counts[0]?.[0] === 3) {
    return named(3, "Three of a Kind", [
      counts[0][1],
      ...kickers(counts.slice(1)),
    ]);
  }
  if (counts[0]?.[0] === 2 && counts[1]?.[0] === 2) {
    const pairs = [counts[0][1], counts[1][1]].sort((a, b) => b - a);
    const kicker = counts[2]?.[1] ?? 0;
    return named(2, "Two Pair", [...pairs, kicker]);
  }
  if (counts[0]?.[0] === 2) {
    return named(1, "One Pair", [counts[0][1], ...kickers(counts.slice(1))]);
  }
  return named(0, "High Card", values);
}

function named(
  rank: number,
  name: HandRankName,
  tiebreak: number[],
): EvaluatedHand {
  return { rank, name, tiebreak };
}

function rankCounts(values: number[]) {
  const map = new Map<number, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  const counts = [...map.entries()]
    .map(([rank, count]) => [count, rank] as const)
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const uniqueDesc = [...new Set(values)].sort((a, b) => b - a);
  return { counts, uniqueDesc };
}

function kickers(rest: ReadonlyArray<readonly [number, number]>) {
  return rest.map(([, rank]) => rank).sort((a, b) => b - a);
}

function straightHighFrom(uniqueDesc: number[]): number | null {
  const uniq = [...uniqueDesc];
  if (uniq.includes(14)) uniq.push(1);
  const sorted = [...new Set(uniq)].sort((a, b) => b - a);
  for (let i = 0; i <= sorted.length - 5; i++) {
    const slice = sorted.slice(i, i + 5);
    if (slice[0]! - slice[4]! === 4) return slice[0] === 14 && slice[1] === 5 ? 5 : slice[0]!;
  }
  // wheel check when A,5,4,3,2 present
  const set = new Set(uniqueDesc);
  if (set.has(14) && set.has(5) && set.has(4) && set.has(3) && set.has(2)) {
    return 5;
  }
  return null;
}
