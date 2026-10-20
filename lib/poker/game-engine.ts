import type { Card, PokerActionType, Winner } from "@/types/poker";
import type { Player } from "@/types/player";
import type { GameState, Room } from "@/types/room";
import { createDeck } from "./deck";
import { shuffledDeck } from "./shuffle";
import { bestOfSeven, compareHands } from "./evaluator";
import { buildSidePots, totalPot } from "./pot";
import { canAct, legalActions, toCall } from "./betting";

const TURN_SECONDS = 30;
const SHOWDOWN_HOLD_MS = 4200;

export function seatedWithChips(room: Room) {
  return room.players
    .filter((p) => p.chipBalance > 0 && !p.removed)
    .sort((a, b) => a.seatNumber - b.seatNumber);
}

export function nextOccupiedSeat(
  room: Room,
  fromSeat: number,
  predicate: (p: Player) => boolean = (p) => p.chipBalance > 0,
) {
  const seated = room.players
    .filter((p) => !p.removed && predicate(p))
    .sort((a, b) => a.seatNumber - b.seatNumber);
  if (seated.length === 0) return null;
  const next =
    seated.find((p) => p.seatNumber > fromSeat) ?? seated[0] ?? null;
  return next?.seatNumber ?? null;
}

export function playerAtSeat(room: Room, seat: number | null) {
  if (seat == null) return undefined;
  return room.players.find((p) => p.seatNumber === seat);
}

export function startGame(room: Room) {
  const seated = seatedWithChips(room);
  if (seated.length < 2) {
    throw new Error("Need at least 2 players with chips to start.");
  }
  room.status = "playing";
  room.game = {
    handNumber: 0,
    dealerSeat: seated[seated.length - 1]!.seatNumber,
    currentSeat: null,
    phase: "waiting",
    pot: 0,
    sidePots: [],
    communityCards: [],
    deck: [],
    minRaise: room.bigBlind,
    currentBet: 0,
    lastRaiseSize: room.bigBlind,
    turnStartedAt: Date.now(),
    turnSeconds: room.turnSeconds || TURN_SECONDS,
    winners: [],
    paused: false,
    actionSeq: 0,
  };
  beginHand(room);
}

export function beginHand(room: Room) {
  const game = room.game;
  if (!game) throw new Error("Game not started.");
  const seated = seatedWithChips(room);
  if (seated.length < 2) {
    room.status = "complete";
    game.phase = "complete";
    game.currentSeat = null;
    game.lastAction = "Game complete";
    return;
  }

  for (const p of room.players) {
    p.folded = p.chipBalance <= 0;
    p.allIn = false;
    p.currentBet = 0;
    p.totalBetThisHand = 0;
    p.contributedThisHand = 0;
    p.holeCards = undefined;
    p.hasActedThisRound = p.chipBalance <= 0;
  }

  const dealerSeat =
    nextOccupiedSeat(room, game.dealerSeat) ?? seated[0]!.seatNumber;
  const isHeadsUp = seated.length === 2;
  const sbSeat = isHeadsUp
    ? dealerSeat
    : (nextOccupiedSeat(room, dealerSeat) ?? dealerSeat);
  const bbSeat =
    nextOccupiedSeat(room, sbSeat) ??
    seated.find((p) => p.seatNumber !== sbSeat)?.seatNumber ??
    sbSeat;

  const deck = shuffledDeck(createDeck());
  const live = room.players.filter(
    (p) => p.chipBalance > 0 && seated.some((s) => s.id === p.id),
  );
  for (const p of live) {
    const c1 = deck.pop();
    const c2 = deck.pop();
    if (!c1 || !c2) throw new Error("Deck exhausted.");
    p.holeCards = [c1, c2];
    p.folded = false;
    p.hasActedThisRound = false;
  }

  game.handNumber += 1;
  game.dealerSeat = dealerSeat;
  game.communityCards = [];
  game.deck = deck;
  game.winners = [];
  game.phase = "preflop";
  game.minRaise = room.bigBlind;
  game.lastRaiseSize = room.bigBlind;
  game.currentBet = 0;
  game.pot = 0;
  game.sidePots = [];
  game.paused = false;

  postBlind(room, sbSeat, room.smallBlind, "small blind");
  postBlind(room, bbSeat, room.bigBlind, "big blind");
  game.currentBet = Math.max(
    ...room.players.map((p) => p.currentBet),
    room.bigBlind,
  );

  const first = isHeadsUp
    ? dealerSeat
    : nextActor(room, bbSeat);
  game.currentSeat = first;
  game.turnStartedAt = Date.now();
  game.lastAction = `Hand #${game.handNumber}`;
  game.actionSeq = (game.actionSeq ?? 0) + 1;
}

function postBlind(room: Room, seat: number, amount: number, label: string) {
  const player = playerAtSeat(room, seat);
  if (!player || !room.game) return;
  const posted = Math.min(amount, player.chipBalance);
  player.chipBalance -= posted;
  player.currentBet += posted;
  player.totalBetThisHand += posted;
  player.contributedThisHand += posted;
  if (player.chipBalance === 0) player.allIn = true;
  player.hasActedThisRound = false;
  room.game.lastAction = `${player.displayName} posts ${label} (${posted})`;
  syncPot(room);
}

function syncPot(room: Room) {
  if (!room.game) return;
  room.game.sidePots = buildSidePots(room.players);
  room.game.pot = totalPot(room.game.sidePots);
}

function livePlayers(room: Room) {
  return room.players.filter((p) => p.chipBalance > 0 || p.contributedThisHand > 0)
    .filter((p) => p.holeCards);
}

function activeInHand(room: Room) {
  return livePlayers(room).filter((p) => !p.folded);
}

function playersWhoCanAct(room: Room) {
  return activeInHand(room).filter((p) => !p.allIn);
}

function nextActor(room: Room, fromSeat: number) {
  const canActNow = playersWhoCanAct(room);
  if (canActNow.length === 0) return null;
  const sorted = [...canActNow].sort((a, b) => a.seatNumber - b.seatNumber);
  return (
    sorted.find((p) => p.seatNumber > fromSeat)?.seatNumber ??
    sorted[0]!.seatNumber
  );
}

function bettingRoundClosed(room: Room) {
  const actors = playersWhoCanAct(room);
  if (actors.length === 0) return true;
  const stillNeed = actors.filter((p) => {
    if (!p.hasActedThisRound) return true;
    return p.currentBet !== room.game!.currentBet;
  });
  return stillNeed.length === 0;
}

export function applyAction(
  room: Room,
  playerId: string,
  type: PokerActionType,
  amount?: number,
) {
  const game = room.game;
  if (!game) throw new Error("Game has not started.");
  if (room.status !== "playing") throw new Error("Game is not in progress.");
  if (game.paused) throw new Error("Game is paused.");
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found.");
  if (!canAct(game, player)) throw new Error("It is not your turn.");

  const legal = legalActions(game, player);
  const match = legal.find((a) => a.type === type);
  if (!match) throw new Error("That action is not allowed.");

  if (type === "fold") {
    player.folded = true;
    player.hasActedThisRound = true;
    game.lastAction = `${player.displayName} folds`;
  } else if (type === "check") {
    player.hasActedThisRound = true;
    game.lastAction = `${player.displayName} checks`;
  } else if (type === "call") {
    const callAmt = Math.min(toCall(game, player), player.chipBalance);
    commitChips(player, callAmt);
    player.hasActedThisRound = true;
    game.lastAction = `${player.displayName} calls ${callAmt}`;
  } else if (type === "bet" || type === "raise") {
    const maxTo = player.chipBalance + player.currentBet;
    const minTo = match.min ?? game.currentBet;
    const target = Math.round(amount ?? minTo);
    if (target < minTo && target < maxTo) {
      throw new Error(`Minimum is ${minTo}.`);
    }
    if (target > maxTo) throw new Error("Not enough chips.");
    const add = target - player.currentBet;
    const raiseSize = target - game.currentBet;
    commitChips(player, add);
    if (target > game.currentBet) {
      game.lastRaiseSize = Math.max(raiseSize, game.lastRaiseSize);
      game.minRaise = Math.max(raiseSize, room.bigBlind);
      game.currentBet = target;
      reopenBetting(room, player.id);
    }
    player.hasActedThisRound = true;
    game.lastAction = `${player.displayName} ${type === "bet" ? "bets" : "raises to"} ${target}`;
  } else if (type === "all-in") {
    const add = player.chipBalance;
    const target = player.currentBet + add;
    commitChips(player, add);
    if (target > game.currentBet) {
      const raiseSize = target - game.currentBet;
      game.currentBet = target;
      if (raiseSize >= game.minRaise) {
        game.lastRaiseSize = raiseSize;
        game.minRaise = raiseSize;
        reopenBetting(room, player.id);
      }
    }
    player.hasActedThisRound = true;
    game.lastAction = `${player.displayName} is all-in`;
  }

  syncPot(room);
  game.actionSeq = (game.actionSeq ?? 0) + 1;
  game.turnStartedAt = Date.now();
  advanceAfterAction(room, player.seatNumber);
}

function commitChips(player: Player, amount: number) {
  const add = Math.min(amount, player.chipBalance);
  player.chipBalance -= add;
  player.currentBet += add;
  player.totalBetThisHand += add;
  player.contributedThisHand += add;
  if (player.chipBalance === 0) player.allIn = true;
}

function reopenBetting(room: Room, actorId: string) {
  for (const p of playersWhoCanAct(room)) {
    if (p.id !== actorId) p.hasActedThisRound = false;
  }
}

function advanceAfterAction(room: Room, fromSeat: number) {
  const remaining = activeInHand(room);
  if (remaining.length === 1) {
    awardUncontested(room, remaining[0]!);
    return;
  }
  if (!bettingRoundClosed(room)) {
    const next = nextActor(room, fromSeat);
    room.game!.currentSeat = next;
    room.game!.turnStartedAt = Date.now();
    return;
  }
  nextStreet(room);
}

function resetRoundBets(room: Room) {
  for (const p of room.players) {
    p.currentBet = 0;
    p.hasActedThisRound = p.folded || p.allIn || !p.holeCards;
  }
  if (!room.game) return;
  room.game.currentBet = 0;
  room.game.minRaise = room.bigBlind;
  room.game.lastRaiseSize = room.bigBlind;
}

function dealCommunity(room: Room, count: number) {
  const game = room.game!;
  game.deck.pop(); // burn
  for (let i = 0; i < count; i++) {
    const card = game.deck.pop();
    if (card) game.communityCards.push(card);
  }
}

function firstPostflopActor(room: Room) {
  return nextActor(room, room.game!.dealerSeat);
}

function nextStreet(room: Room) {
  const game = room.game!;
  const actors = playersWhoCanAct(room);
  resetRoundBets(room);
  syncPot(room);

  if (actors.length <= 1 && activeInHand(room).length > 1) {
    runoutAndShowdown(room);
    return;
  }

  if (game.phase === "preflop") {
    game.phase = "flop";
    dealCommunity(room, 3);
  } else if (game.phase === "flop") {
    game.phase = "turn";
    dealCommunity(room, 1);
  } else if (game.phase === "turn") {
    game.phase = "river";
    dealCommunity(room, 1);
  } else if (game.phase === "river") {
    goShowdown(room);
    return;
  }

  const next = firstPostflopActor(room);
  if (next == null) {
    runoutAndShowdown(room);
    return;
  }
  game.currentSeat = next;
  game.turnStartedAt = Date.now();
}

function runoutAndShowdown(room: Room) {
  const game = room.game!;
  while (game.communityCards.length < 5) {
    const need = game.communityCards.length === 0 ? 3 : 1;
    dealCommunity(room, need);
  }
  goShowdown(room);
}

function goShowdown(room: Room) {
  const game = room.game!;
  game.phase = "showdown";
  game.currentSeat = null;
  const contenders = activeInHand(room);
  const pots = buildSidePots(room.players);
  game.sidePots = pots;
  game.pot = totalPot(pots);
  const winners: Winner[] = [];

  for (const pot of pots) {
    const eligible = contenders.filter((p) =>
      pot.eligiblePlayerIds.includes(p.id),
    );
    if (eligible.length === 0) continue;
    const ranked = eligible.map((p) => ({
      player: p,
      hand: bestOfSeven([...(p.holeCards ?? []), ...game.communityCards]),
    }));
    ranked.sort((a, b) => compareHands(b.hand, a.hand));
    const best = ranked[0]!.hand;
    const tied = ranked.filter((r) => compareHands(r.hand, best) === 0);
    const share = Math.floor(pot.amount / tied.length);
    let remainder = pot.amount - share * tied.length;
    for (const t of tied) {
      let won = share;
      if (remainder > 0) {
        won += 1;
        remainder -= 1;
      }
      t.player.chipBalance += won;
      winners.push({
        playerId: t.player.id,
        displayName: t.player.displayName,
        amount: won,
        handName: t.hand.name,
      });
    }
  }

  game.winners = mergeWinners(winners);
  game.lastAction = formatWinners(game.winners);
  game.turnStartedAt = Date.now();
  game.pot = 0;
  game.sidePots = [];
  for (const p of room.players) {
    p.currentBet = 0;
  }
}

function mergeWinners(winners: Winner[]) {
  const map = new Map<string, Winner>();
  for (const w of winners) {
    const prev = map.get(w.playerId);
    if (prev) {
      prev.amount += w.amount;
    } else {
      map.set(w.playerId, { ...w });
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

function formatWinners(winners: Winner[]) {
  if (winners.length === 0) return "Pot returned";
  return winners
    .map((w) => `${w.displayName} wins ${w.amount} chips${w.handName !== "Win" ? ` with ${w.handName}` : ""}`)
    .join(" · ");
}

function awardUncontested(room: Room, winner: Player) {
  const game = room.game!;
  syncPot(room);
  const amount = game.pot;
  winner.chipBalance += amount;
  game.winners = [
    {
      playerId: winner.id,
      displayName: winner.displayName,
      amount,
      handName: "Win",
    },
  ];
  game.phase = "showdown";
  game.currentSeat = null;
  game.pot = 0;
  game.sidePots = [];
  game.lastAction = `${winner.displayName} wins ${amount} chips`;
  game.turnStartedAt = Date.now();
  game.turnStartedAt = Date.now();
  for (const p of room.players) p.currentBet = 0;
}

export function playerLeaveHand(room: Room, playerId: string) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || !room.game) return;
  if (player.folded || !player.holeCards) return;
  const wasTurn = room.game.currentSeat === player.seatNumber;
  player.folded = true;
  player.hasActedThisRound = true;
  room.game.lastAction = `${player.displayName} left the hand`;
  const remaining = activeInHand(room);
  if (remaining.length === 1) {
    awardUncontested(room, remaining[0]!);
    return;
  }
  if (wasTurn) {
    advanceAfterAction(room, player.seatNumber);
  } else if (bettingRoundClosed(room) && remaining.length > 1) {
    nextStreet(room);
  }
}

export function autoAct(room: Room) {
  const game = room.game;
  if (!game || game.paused || game.currentSeat == null) return;
  if (Date.now() - game.turnStartedAt < game.turnSeconds * 1000) return;
  const player = playerAtSeat(room, game.currentSeat);
  if (!player) return;
  const legal = legalActions(game, player);
  if (legal.some((a) => a.type === "check")) {
    applyAction(room, player.id, "check");
  } else {
    applyAction(room, player.id, "fold");
  }
}

export function maybeAdvanceShowdown(room: Room, onDone: () => void) {
  const game = room.game;
  if (!game || game.phase !== "showdown") return;
  const started = game.turnStartedAt;
  // reuse turnStartedAt at showdown start
  if (Date.now() - started < SHOWDOWN_HOLD_MS && game.winners.length >= 0) {
    // wait handled by timer loop using a dedicated field — set if needed
  }
}

export function continueAfterShowdown(room: Room) {
  if (!room.game || room.game.phase !== "showdown") return;
  beginHand(room);
}

export function pauseGame(room: Room, paused: boolean) {
  if (!room.game) throw new Error("Start the game before pause or resume.");
  room.game.paused = paused;
  room.status = paused ? "paused" : "playing";
  if (!paused) room.game.turnStartedAt = Date.now();
}

export function endGame(room: Room) {
  room.status = "complete";
  if (room.game) {
    room.game.phase = "complete";
    room.game.currentSeat = null;
    room.game.paused = true;
    room.game.lastAction = "Host ended the game";
  }
}

export function resetToLobby(room: Room, resetChips: boolean) {
  room.status = "lobby";
  room.locked = false;
  room.game = null;
  for (const p of room.players) {
    if (resetChips) p.chipBalance = room.startingChips;
    p.folded = false;
    p.allIn = false;
    p.currentBet = 0;
    p.totalBetThisHand = 0;
    p.contributedThisHand = 0;
    p.holeCards = undefined;
    p.hasActedThisRound = false;
  }
}

export function burnAndPeekCommunity(cards: Card[]) {
  return cards;
}

export { TURN_SECONDS, SHOWDOWN_HOLD_MS };
