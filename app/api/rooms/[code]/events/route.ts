import { getTokenFromRequest } from "@/lib/session";
import { ensureStore, findPlayerByToken, getRoomById, getRoomByInviteToken, snapshotFor, subscribe } from "@/lib/store/rooms";
import { subscribeSignals } from "@/lib/video/signal-bus";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  await ensureStore(req);
  const room = getRoomByInviteToken(code);
  if (!room) {
    return new Response(JSON.stringify({ error: "This invitation is not valid." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = getTokenFromRequest(req);
  const member = findPlayerByToken(room, token);
  if (!member || member.removed) {
    return new Response(JSON.stringify({ error: "Join this room first." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const roomId = room.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const current = getRoomById(roomId);
        if (!current) return;
        const payload = snapshotFor(current, token);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };
      send();
      const unsub = subscribe(room.roomCode, send);
      const unsubSignals = subscribeSignals(roomId, member.id, (signal) => {
        controller.enqueue(encoder.encode(`event: signal\ndata: ${JSON.stringify(signal)}\n\n`));
      });
      const ping = setInterval(() => {
        void ensureStore()
          .then(() => send())
          .catch(() => undefined);
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 2000);
      const abort = () => {
        unsub();
        unsubSignals();
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
