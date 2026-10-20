import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/http/origin";
import {
  endGame,
  pauseGame,
  playerLeaveHand,
  resetToLobby,
  startGame,
} from "@/lib/poker/game-engine";
import { jsonError, loadRoomPlayer, requireHost } from "@/lib/api/guard";
import { readAdminFromRequest } from "@/lib/admin/auth";
import { currentInviteToken, issueInvitation } from "@/lib/admin/invitations";
import { ensureStore, getRoomByCode, getRoomById, getRoomByInviteToken, listRooms, saveRoomNow, snapshotFor } from "@/lib/store/rooms";
import type { Room } from "@/types/room";

function restartTarget(room: Room) {
  const seatedHere = room.players.filter((player) => !player.removed);
  if (seatedHere.some((player) => player.isConnected)) return room;
  return (
    listRooms().find((candidate) => {
      if (candidate.id === room.id || candidate.closedAt) return false;
      const seated = candidate.players.filter((player) => !player.removed);
      const over = candidate.status === "complete" || candidate.game?.phase === "complete";
      return over && seated.length >= 2 && seated.some((player) => player.isConnected);
    }) ?? room
  );
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  await ensureStore(req);
  let room = getRoomById(code) ?? getRoomByCode(code) ?? getRoomByInviteToken(code);
  if (!room) return jsonError("Room not found.", 404);
  const body = (await req.json().catch(() => null)) as {
    command?: string;
    playerId?: string;
    amount?: number;
    startingChips?: number;
    smallBlind?: number;
    maxPlayers?: number;
    locked?: boolean;
    turnSeconds?: number;
  };
  const admin = readAdminFromRequest(req);
  let viewerToken: string | null = null;
  if (!admin) {
    const loaded = await loadRoomPlayer(req, code);
    if ("error" in loaded) return loaded.error;
    const openCommands = new Set(["lobby", "start", "lock", "unlock", "pause", "resume"]);
    if (!openCommands.has(body?.command ?? "")) {
      const forbidden = requireHost(loaded.room, loaded.player);
      if (forbidden) return forbidden;
    }
    room = loaded.room;
    viewerToken = loaded.player.token;
  }

  try {
    switch (body?.command) {
      case "start": {
        const seated = room.players.filter((p) => !p.removed);
        if (seated.length < 2) {
          return jsonError("Need at least 2 players seated before the game can start.");
        }
        if (
          room.status === "playing" &&
          room.game &&
          room.game.phase !== "complete"
        ) {
          break;
        }
        const restoreStacks = room.status === "complete" || room.game?.phase === "complete";
        if (restoreStacks) resetToLobby(room, true);
        if (body.turnSeconds) {
          const seconds = Number(body.turnSeconds);
          if (Number.isFinite(seconds) && seconds >= 10 && seconds <= 180) {
            room.turnSeconds = Math.round(seconds);
          }
        }
        if (!room.turnSeconds) room.turnSeconds = 30;
        startGame(room);
        break;
      }
      case "pause": {
        pauseGame(room, true);
        break;
      }
      case "resume": {
        pauseGame(room, false);
        break;
      }
      case "end": {
        endGame(room);
        break;
      }
      case "lock": {
        room.locked = true;
        break;
      }
      case "unlock": {
        room.locked = false;
        break;
      }
      case "kick": {
        const target = room.players.find((p) => p.id === body.playerId);
        if (!target) return jsonError("Player not found.");
        playerLeaveHand(room, target.id);
        target.removed = true;
        target.isConnected = false;
        target.holeCards = undefined;
        break;
      }
      case "settings": {
        if (room.status !== "lobby") {
          return jsonError("Settings can only change in the lobby.");
        }
        if (body.startingChips) {
          const chips = Number(body.startingChips);
          if (chips < 100 || chips > 1_000_000) return jsonError("Invalid chips.");
          room.startingChips = chips;
          for (const p of room.players) p.chipBalance = chips;
        }
        if (body.smallBlind) {
          const sb = Number(body.smallBlind);
          if (sb < 1 || sb * 2 >= room.startingChips) return jsonError("Invalid blinds.");
          room.smallBlind = sb;
          room.bigBlind = sb * 2;
        }
        if (body.maxPlayers) {
          const max = Number(body.maxPlayers);
          if (![2, 4, 6, 8, 9].includes(max)) return jsonError("Invalid table size.");
          if (max < room.players.length) return jsonError("Too many seated players.");
          room.maxPlayers = max;
        }
        if (body.turnSeconds) {
          const seconds = Number(body.turnSeconds);
          if (!Number.isFinite(seconds) || seconds < 10 || seconds > 180) {
            return jsonError("Turn time must be between 10 and 180 seconds.");
          }
          room.turnSeconds = Math.round(seconds);
        }
        break;
      }
      case "add-chips": {
        const target = room.players.find((p) => p.id === body.playerId && !p.removed);
        if (!target) return jsonError("Player not found.");
        const amount = Math.floor(Number(body.amount));
        if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) {
          return jsonError("Enter an amount between 1 and 1,000,000.");
        }
        target.chipBalance = Math.min(10_000_000, target.chipBalance + amount);
        if (target.allIn && target.chipBalance > 0) target.allIn = false;
        if (room.game) {
          room.game.lastAction = `${target.displayName} received ${amount} chips`;
        }
        break;
      }
      case "add-bot": {
        if (process.env.NODE_ENV === "production") {
          return jsonError("Practice seats are only available in development.", 403);
        }
        if (room.status !== "lobby") return jsonError("Add practice seats from the lobby.");
        if (room.players.length >= room.maxPlayers) return jsonError("Table is full.");
        const names = ["Rahul", "Akash", "Neha", "Priya", "Arjun", "Meera", "Kabir"];
        const used = new Set(room.players.map((p) => p.displayName));
        const displayName = names.find((n) => !used.has(n)) ?? `Guest ${room.players.length + 1}`;
        const taken = room.players.map((p) => p.seatNumber);
        let seat = 1;
        while (taken.includes(seat)) seat += 1;
        room.players.push({
          id: crypto.randomUUID(),
          token: `bot-${crypto.randomUUID()}`,
          sessionId: `bot-${crypto.randomUUID()}`,
          displayName,
          seatNumber: seat,
          chipBalance: room.startingChips,
          currentBet: 0,
          totalBetThisHand: 0,
          isHost: false,
          isConnected: true,
          lastSeenAt: Date.now() + 86_400_000,
          cameraEnabled: false,
          microphoneEnabled: false,
          folded: false,
          allIn: false,
          hasActedThisRound: false,
          isReady: true,
          contributedThisHand: 0,
        });
        break;
      }
      case "lobby": {
        resetToLobby(room, true);
        break;
      }
      case "play-again":
      case "restart": {
        room = restartTarget(room);
        if (room.closedAt || room.status === "closed") return jsonError("This room is closed.");
        const seated = room.players.filter((p) => !p.removed);
        if (seated.length < 2) return jsonError("Need at least 2 players to restart.");
        resetToLobby(room, true);
        startGame(room);
        break;
      }
      case "deal-again": {
        if (room.closedAt || room.status === "closed") return jsonError("This room is closed.");
        const funded = room.players.filter((p) => !p.removed && p.chipBalance > 0);
        if (funded.length < 2) return jsonError("Need at least 2 players with chips.");
        resetToLobby(room, false);
        startGame(room);
        break;
      }
      case "regenerate": {
        const invitationToken = issueInvitation(room, room.inviteExpiresAt);
        await saveRoomNow(room);
        return NextResponse.json({
          invitationToken,
          invitationUrl: `${publicOrigin(req)}/room/${invitationToken}`,
        });
      }
      case "revoke": {
        room.inviteHash = "";
        await saveRoomNow(room);
        return NextResponse.json({ revoked: true });
      }
      case "reveal": {
        const invitationToken = currentInviteToken(room);
        if (!invitationToken || !room.inviteHash) {
          return jsonError("This invitation has been revoked. Generate a new one.");
        }
        return NextResponse.json({
          invitationUrl: `${publicOrigin(req)}/room/${invitationToken}`,
        });
      }
      case "close": {
        endGame(room);
        room.status = "closed";
        room.closedAt = Date.now();
        room.locked = true;
        room.inviteHash = "";
        break;
      }
      case "reset": {
        if (process.env.NODE_ENV === "production") {
          return jsonError("Reset is not available.", 403);
        }
        resetToLobby(room, true);
        break;
      }
      default:
        return jsonError("Unknown host command.");
    }

    await saveRoomNow(room);
    return NextResponse.json({ snapshot: snapshotFor(room, viewerToken) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Host action failed.";
    return jsonError(message);
  }
}
