import { NextResponse } from "next/server";
import { loadRoomPlayer } from "@/lib/api/guard";
import { heartbeat, saveRoomNow, snapshotFor } from "@/lib/store/rooms";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const loaded = await loadRoomPlayer(req, code);
  if ("error" in loaded) return loaded.error;
  const { room, player, token } = loaded;
  const body = (await req.json()) as {
    cameraEnabled?: boolean;
    microphoneEnabled?: boolean;
    ready?: boolean;
  };
  if (typeof body.cameraEnabled === "boolean") player.cameraEnabled = body.cameraEnabled;
  if (typeof body.microphoneEnabled === "boolean") {
    player.microphoneEnabled = body.microphoneEnabled;
  }
  if (typeof body.ready === "boolean") player.isReady = body.ready;
  heartbeat(room, player);
  await saveRoomNow(room);
  return NextResponse.json({ snapshot: snapshotFor(room, token) });
}
