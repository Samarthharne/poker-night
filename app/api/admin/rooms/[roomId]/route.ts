import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { ensureStore, getRoomById } from "@/lib/store/rooms";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ roomId: string }> },
) {
  const admin = requireAdmin(req);
  if (admin instanceof Response) return admin;
  await ensureStore();
  const { roomId } = await ctx.params;
  const room = getRoomById(roomId);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  return NextResponse.json({
    room: {
      id: room.id,
      name: room.name,
      roomCode: room.roomCode,
      status: room.closedAt ? "closed" : room.status,
      locked: room.locked,
      maxPlayers: room.maxPlayers,
      startingChips: room.startingChips,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      inviteExpiresAt: room.inviteExpiresAt,
      invitationActive: Boolean(room.inviteHash) && !room.closedAt,
      phase: room.game?.phase ?? "lobby",
      players: room.players
        .filter((p) => !p.removed)
        .map((p) => ({
          id: p.id,
          displayName: p.displayName,
          seatNumber: p.seatNumber,
          chipBalance: p.chipBalance,
          isConnected: p.isConnected,
        })),
    },
  });
}
