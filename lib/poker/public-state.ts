import type { Room, RoomSnapshot } from "@/types/room";
import type { Player, PublicPlayer } from "@/types/player";
import { RTC_MESSAGE_TTL_MS, isRtcMessageType, samePlayerId } from "@/lib/video/rtc-protocol";
import { canAct, legalActions } from "./betting";

export function toSnapshot(
  room: Room,
  viewerId: string | null,
  options?: { includeDeck?: boolean },
): RoomSnapshot {
  const you = room.players.find((p) => p.id === viewerId) ?? null;
  const showdown = room.game?.phase === "showdown" || room.game?.phase === "complete";

  return {
    id: room.id,
    roomCode: room.roomCode,
    name: room.name,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    startingChips: room.startingChips,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    turnSeconds: room.turnSeconds || 30,
    status: room.game ? room.status : "lobby",
    locked: room.locked,
    createdAt: room.createdAt,
    generation: room.generation ?? 0,
    players: room.players
      .filter((p) => !p.removed)
      .map((p) => publicPlayer(p, viewerId, showdown)),
    game: room.game
      ? {
          handNumber: room.game.handNumber,
          dealerSeat: room.game.dealerSeat,
          currentSeat: room.game.currentSeat,
          phase: room.game.phase,
          pot: room.game.pot,
          sidePots: room.game.sidePots,
          communityCards: room.game.communityCards,
          minRaise: room.game.minRaise,
          currentBet: room.game.currentBet,
          lastRaiseSize: room.game.lastRaiseSize,
          turnStartedAt: room.game.turnStartedAt,
          turnSeconds: room.game.turnSeconds,
          winners: room.game.winners,
          lastAction: room.game.lastAction,
          paused: room.game.paused,
          actionSeq: room.game.actionSeq ?? 0,
          deckRemaining: room.game.deck.length,
          deck: options?.includeDeck ? room.game.deck : undefined,
        }
      : null,
    messages: room.messages.slice(-80),
    you: you ? publicPlayer(you, viewerId, true) : null,
    legalActions:
      you && room.game && canAct(room.game, you)
        ? legalActions(room.game, you)
        : [],
    serverTime: Date.now(),
    connected: true,
    rtcMessages: viewerInbox(room, viewerId),
  };
}

function viewerInbox(room: Room, viewerId: string | null): NonNullable<RoomSnapshot["rtcMessages"]> {
  if (!viewerId) return [];
  const now = Date.now();
  return (room.rtcSignals ?? [])
    .filter((item) => samePlayerId(item.to, viewerId) && now - (item.createdAt ?? item.at) < RTC_MESSAGE_TTL_MS)
    .filter((item) => isRtcMessageType(item.type));
}

function publicPlayer(
  player: Player,
  viewerId: string | null,
  revealIfShowdown: boolean,
): PublicPlayer {
  const reveal =
    player.id === viewerId || (revealIfShowdown && !player.folded && Boolean(player.holeCards));
  return {
    id: player.id,
    sessionId: player.sessionId,
    displayName: player.displayName,
    seatNumber: player.seatNumber,
    chipBalance: player.chipBalance,
    currentBet: player.currentBet,
    totalBetThisHand: player.totalBetThisHand,
    isHost: false,
    isConnected: player.isConnected,
    lastSeenAt: player.lastSeenAt,
    cameraEnabled: player.cameraEnabled,
    microphoneEnabled: player.microphoneEnabled,
    folded: player.folded,
    allIn: player.allIn,
    hasActedThisRound: player.hasActedThisRound,
    isReady: player.isReady,
    contributedThisHand: player.contributedThisHand,
    holeCards: reveal ? player.holeCards ?? null : null,
    hasCards: Boolean(player.holeCards) && !player.folded,
  };
}
