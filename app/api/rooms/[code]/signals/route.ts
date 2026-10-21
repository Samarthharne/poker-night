import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/admin/rate-limit";
import { loadRoomPlayer } from "@/lib/api/guard";
import { persistRooms } from "@/lib/store/rooms";
import {
  persistSignal,
  publishSignal,
  subscribeSignals,
  takePersistedSignals,
  type RtcSignal,
} from "@/lib/video/signal-bus";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  if (!rateLimit(clientKey(req, "video-signal"), 2000, 60_000)) {
    return NextResponse.json({ error: "Too many video signals." }, { status: 429 });
  }
  const { code } = await ctx.params;
  const loaded = await loadRoomPlayer(req, code);
  if ("error" in loaded) return loaded.error;
  const body = (await req.json().catch(() => null)) as {
    to?: string;
    description?: { type?: string; sdp?: string };
    candidate?: Record<string, unknown> | null;
  } | null;
  const to = body?.to;
  if (!to || to === loaded.player.id) {
    return NextResponse.json({ error: "Choose another player." }, { status: 400 });
  }
  const target = loaded.room.players.find((player) => player.id === to && !player.removed);
  if (!target) return NextResponse.json({ error: "That player is not in the room." }, { status: 404 });
  const signal: RtcSignal = { from: loaded.player.id, to };
  if (body?.description?.type) {
    signal.description = { type: body.description.type, sdp: body.description.sdp };
  }
  if (body?.candidate) signal.candidate = body.candidate;
  if (!signal.description && !signal.candidate) {
    return NextResponse.json({ error: "Missing video signal." }, { status: 400 });
  }
  publishSignal(loaded.room.id, signal);
  persistSignal(loaded.room, signal);
  if (signal.description) await persistRooms();
  return NextResponse.json({ ok: true });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const loaded = await loadRoomPlayer(req, code);
  if ("error" in loaded) return loaded.error;
  if (new URL(req.url).searchParams.get("poll") === "1") {
    const signals = takePersistedSignals(loaded.room, loaded.player.id);
    return NextResponse.json({ signals });
  }
  const roomId = loaded.room.id;
  const playerId = loaded.player.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (signal: RtcSignal) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(signal)}\n\n`));
      };
      const unsub = subscribeSignals(roomId, playerId, send);
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 12000);
      const abort = () => {
        unsub();
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
