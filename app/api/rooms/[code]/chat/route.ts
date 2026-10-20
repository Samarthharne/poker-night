import { NextResponse } from "next/server";
import { jsonError, loadRoomPlayer } from "@/lib/api/guard";
import { newId, saveRoom, snapshotFor } from "@/lib/store/rooms";

const REACTIONS = new Set(["😂", "🔥", "👏", "😮", "GG"]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const loaded = await loadRoomPlayer(req, code);
  if ("error" in loaded) return loaded.error;
  const { room, player, token } = loaded;

  const body = (await req.json()) as { message?: string };
  const message = (body.message ?? "").trim().slice(0, 240);
  if (!message) return jsonError("Message required.");
  if (message.length > 2 && !REACTIONS.has(message) && message.length < 1) {
    return jsonError("Message required.");
  }

  room.messages.push({
    id: newId(),
    playerId: player.id,
    displayName: player.displayName,
    message,
    createdAt: Date.now(),
  });
  if (room.messages.length > 120) room.messages.splice(0, room.messages.length - 120);
  saveRoom(room);
  return NextResponse.json({ snapshot: snapshotFor(room, token) });
}
