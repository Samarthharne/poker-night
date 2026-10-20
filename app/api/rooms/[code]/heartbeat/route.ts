import { NextResponse } from "next/server";
import { jsonError, loadRoom, requirePlayer } from "@/lib/auth";
import { heartbeat, snapshotFor } from "@/lib/store/rooms";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const room = await loadRoom(code, req);
    const player = requirePlayer(req, room);
    heartbeat(room, player);
    return NextResponse.json({ snapshot: snapshotFor(room, player.token) });
  } catch (error) {
    const { message, status } = jsonError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
