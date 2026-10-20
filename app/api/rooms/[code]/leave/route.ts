import { NextResponse } from "next/server";
import { playerLeaveHand } from "@/lib/poker/game-engine";
import { loadRoomPlayer } from "@/lib/api/guard";
import { saveRoom, snapshotFor } from "@/lib/store/rooms";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const loaded = await loadRoomPlayer(req, code);
  if ("error" in loaded) return loaded.error;
  const { room, player } = loaded;

  playerLeaveHand(room, player.id);

  if (room.status === "lobby" || room.status === "complete") {
    room.players = room.players.filter((p) => p.id !== player.id);
    if (player.isHost && room.players[0]) {
      room.players[0].isHost = true;
      room.hostId = room.players[0].id;
    }
  } else {
    player.isConnected = false;
    player.cameraEnabled = false;
    player.microphoneEnabled = false;
  }

  saveRoom(room);
  return NextResponse.json({ ok: true, snapshot: snapshotFor(room, null) });
}
