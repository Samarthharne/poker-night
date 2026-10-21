import { NextResponse } from "next/server";
import { markPlayerLeft } from "@/lib/poker/game-engine";
import { loadRoomPlayer } from "@/lib/api/guard";
import { saveRoomNow, snapshotFor } from "@/lib/store/rooms";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const loaded = await loadRoomPlayer(req, code);
  if ("error" in loaded) return loaded.error;
  const { room, player } = loaded;

  markPlayerLeft(room, player.id);
  if (player.isHost) {
    const next = room.players.find((item) => !item.removed);
    if (next) next.isHost = false;
  }

  await saveRoomNow(room);
  return NextResponse.json({ ok: true, snapshot: snapshotFor(room, null) });
}
