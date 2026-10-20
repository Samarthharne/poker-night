import { getTokenFromRequest } from "./session";
import { ensureStore, findPlayerByToken, getRoomByInviteToken } from "./store/rooms";
import type { Room } from "@/types/room";
import type { Player } from "@/types/player";

export async function loadRoom(code: string) {
  await ensureStore();
  const room = getRoomByInviteToken(code);
  if (!room) {
    throw Object.assign(new Error("This invitation is not valid."), { status: 404 });
  }
  return room;
}

export function requirePlayer(req: Request, room: Room): Player {
  const token = getTokenFromRequest(req);
  const player = findPlayerByToken(room, token);
  if (!player || player.removed) {
    throw Object.assign(new Error("Join this room first."), { status: 401 });
  }
  return player;
}

export function requireHost(player: Player) {
  if (!player.isHost) {
    throw Object.assign(new Error("Only the host can do that."), { status: 403 });
  }
}

export function jsonError(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status: number }).status)
      : 400;
  return { message, status: Number.isFinite(status) ? status : 400 };
}
