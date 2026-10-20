import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { issueInvitation } from "@/lib/admin/invitations";
import { publicOrigin } from "@/lib/http/origin";
import { createEmptyRoom, ensureStore, listRooms, persistRooms } from "@/lib/store/rooms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const admin = requireAdmin(req);
  if (admin instanceof Response) return admin;
  await ensureStore(req);
  const rooms = listRooms();
  const connected = rooms.reduce(
    (sum, room) => sum + room.players.filter((p) => !p.removed && isPresent(p)).length,
    0,
  );
  return NextResponse.json({
    total: rooms.length,
    active: rooms.filter((room) => room.status !== "closed" && !room.closedAt).length,
    connected,
    rooms: rooms.slice(0, 20).map(summarize),
  });
}

export async function POST(req: Request) {
  const admin = requireAdmin(req);
  if (admin instanceof Response) return admin;
  try {
    await ensureStore(req);
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      maxPlayers?: number;
      startingChips?: number;
      smallBlind?: number;
      expiresInHours?: number;
      turnSeconds?: number;
    };
    const name = (body.name ?? "").trim();
    const maxPlayers = Number(body.maxPlayers);
    const startingChips = Number(body.startingChips);
    const smallBlind = Number(body.smallBlind);
    if (name.length < 2) {
      return NextResponse.json({ error: "Enter a room name." }, { status: 400 });
    }
    if (![2, 4, 6, 8, 9].includes(maxPlayers)) {
      return NextResponse.json({ error: "Invalid table size." }, { status: 400 });
    }
    if (!Number.isFinite(startingChips) || startingChips < 100 || startingChips > 1_000_000) {
      return NextResponse.json({ error: "Invalid starting chips." }, { status: 400 });
    }
    if (!Number.isFinite(smallBlind) || smallBlind < 1 || smallBlind * 2 >= startingChips) {
      return NextResponse.json({ error: "Invalid blinds." }, { status: 400 });
    }
    const hours = Number(body.expiresInHours);
    const expiresAt =
      Number.isFinite(hours) && hours > 0 ? Date.now() + hours * 60 * 60 * 1000 : null;
    const turnSeconds = Number(body.turnSeconds);
    const room = createEmptyRoom({
      name,
      maxPlayers,
      startingChips,
      smallBlind,
      turnSeconds: Number.isFinite(turnSeconds) ? turnSeconds : 30,
    });
    room.expiresAt = expiresAt;
    room.hostId = "admin";
    const token = issueInvitation(room, expiresAt);
    await persistRooms();
    const invitationUrl = `${publicOrigin(req)}/room/${token}`;
    return NextResponse.json({ room: summarize(room), invitationUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the room";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isPresent(player: { removed?: boolean; isConnected?: boolean; lastSeenAt?: number }) {
  if (player.removed) return false;
  if (player.isConnected) return true;
  return Date.now() - (player.lastSeenAt ?? 0) < 90_000;
}

function summarize(room: ReturnType<typeof listRooms>[number]) {
  const seated = room.players.filter((p) => !p.removed);
  return {
    id: room.id,
    name: room.name,
    roomCode: room.roomCode,
    status: room.closedAt ? "closed" : room.status,
    locked: room.locked,
    maxPlayers: room.maxPlayers,
    startingChips: room.startingChips,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    players: seated.length,
    connected: seated.filter(isPresent).length,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    invitationActive: Boolean(room.inviteHash) && !room.closedAt,
    phase: room.game?.phase ?? "lobby",
    playerNames: room.players.filter((p) => !p.removed).map((p) => p.displayName),
    seatedPlayers: room.players
      .filter((p) => !p.removed)
      .map((p) => ({
        id: p.id,
        displayName: p.displayName,
        seatNumber: p.seatNumber,
        chipBalance: p.chipBalance,
        isConnected: p.isConnected,
      })),
  };
}
