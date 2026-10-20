import { NextResponse } from "next/server";
import { jsonError, loadRoom } from "@/lib/auth";
import { joinBlockReason } from "@/lib/admin/invitations";
import { clientKey, rateLimit } from "@/lib/admin/rate-limit";
import { getTokenFromRequest } from "@/lib/session";
import { findPlayerByToken, heartbeat, saveRoomNow, snapshotFor } from "@/lib/store/rooms";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const token = getTokenFromRequest(req);
  if (!token && !rateLimit(clientKey(req, "invite-read"), 30, 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }
  try {
    const { code } = await ctx.params;
    const room = await loadRoom(code, req);
    const player = findPlayerByToken(room, token);
    if (player && !player.removed) {
      heartbeat(room, player);
      await saveRoomNow(room);
      return NextResponse.json({ snapshot: snapshotFor(room, token) });
    }
    const block = joinBlockReason(room, code);
    if (block) return NextResponse.json({ error: block }, { status: 403 });
    return NextResponse.json({
      preview: {
        name: room.name,
        players: room.players.filter((p) => !p.removed).length,
        maxPlayers: room.maxPlayers,
        canJoin: true,
      },
    });
  } catch (error) {
    const { message, status } = jsonError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
