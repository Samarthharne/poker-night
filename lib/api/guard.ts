import { NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/session";
import { ensureStore, findPlayerByToken, getRoomByCode, getRoomByInviteToken } from "@/lib/store/rooms";
import type { Player } from "@/types/player";
import type { Room } from "@/types/room";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function loadRoomPlayer(
  req: Request,
  code: string,
): Promise<{ error: NextResponse } | { room: Room; player: Player; token: string }> {
  await ensureStore();
  const room = getRoomByInviteToken(code) ?? getRoomByCode(code);
  if (!room) return { error: jsonError("This invitation is not valid.", 404) };
  const token = getTokenFromRequest(req);
  const player = findPlayerByToken(room, token);
  if (!token || !player || player.removed) {
    return { error: jsonError("Join this room first.", 401) };
  }
  return { room, player, token };
}

export function requireHost(room: Room, player: Player) {
  if (!player.isHost && player.id !== room.hostId) {
    return jsonError("Only the administrator can do that.", 403);
  }
  return null;
}
