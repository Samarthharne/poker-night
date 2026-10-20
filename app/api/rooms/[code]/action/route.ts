import { NextResponse } from "next/server";
import { applyAction } from "@/lib/poker/game-engine";
import type { PokerActionType } from "@/types/poker";
import { jsonError, loadRoomPlayer } from "@/lib/api/guard";
import { heartbeat, saveRoom, snapshotFor } from "@/lib/store/rooms";

const ACTIONS: PokerActionType[] = [
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "all-in",
];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const loaded = await loadRoomPlayer(req, code);
  if ("error" in loaded) return loaded.error;
  const { room, player, token } = loaded;

  const body = (await req.json()) as { type?: PokerActionType; amount?: number };
  if (!body.type || !ACTIONS.includes(body.type)) {
    return jsonError("Invalid action.");
  }

  try {
    heartbeat(room, player);
    applyAction(room, player.id, body.type, body.amount);
    if (room.game?.phase === "showdown") {
      room.game.turnStartedAt = Date.now();
    }
    saveRoom(room);
    return NextResponse.json({ snapshot: snapshotFor(room, token) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed.";
    return jsonError(message, 400);
  }
}
