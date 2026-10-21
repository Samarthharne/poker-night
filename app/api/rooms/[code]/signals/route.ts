import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/admin/rate-limit";
import { loadRoomPlayer } from "@/lib/api/guard";
import { ackRoomRtcMessages, persistRtcMessage, publishSignal, takePersistedRtcMessages } from "@/lib/video/signal-bus";
import { ackRtcMessages, appendRtcMessage, readRtcMessages } from "@/lib/video/signal-store";
import { isExpiredMessage, mergeRtcMessages, parseRtcMessage, signalingAllowed } from "@/lib/video/rtc-protocol";

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

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (Array.isArray(body?.ackIds)) {
    const ids = body.ackIds.filter((item): item is string => typeof item === "string").slice(0, 80);
    ackRoomRtcMessages(loaded.room, loaded.player.id, ids);
    await ackRtcMessages(loaded.room.id, loaded.player.id, ids, req);
    return NextResponse.json({ ok: true });
  }

  const message = parseRtcMessage(body, { roomId: loaded.room.id, from: loaded.player.id });
  if (!message) return NextResponse.json({ error: "Missing video signal." }, { status: 400 });
  message.from = loaded.player.id;
  message.roomId = loaded.room.id;
  if (isExpiredMessage(message)) {
    return NextResponse.json({ error: "Signal expired." }, { status: 400 });
  }
  const members = loaded.room.players.filter((player) => !player.removed).map((player) => player.id);
  if (
    !signalingAllowed({
      senderId: loaded.player.id,
      targetId: message.to,
      memberIds: members,
      roomId: loaded.room.id,
      messageRoomId: message.roomId,
    })
  ) {
    return NextResponse.json({ error: "That player is not in the room." }, { status: 404 });
  }
  publishSignal(loaded.room.id, {
    from: message.from,
    to: message.to,
    description: message.payload.sdp,
    candidate: (message.payload.candidate as Record<string, unknown> | null) ?? null,
    at: message.createdAt,
  });
  persistRtcMessage(loaded.room, message);
  void appendRtcMessage(loaded.room.id, message, req);
  return NextResponse.json({ ok: true, stored: true, id: message.id });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const loaded = await loadRoomPlayer(req, code);
  if ("error" in loaded) return loaded.error;
  const messages = mergeRtcMessages(
    takePersistedRtcMessages(loaded.room, loaded.player.id),
    await Promise.race([
      readRtcMessages(loaded.room.id, loaded.player.id, req),
      new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 400)),
    ]),
  );
  return NextResponse.json(
    { messages, signals: messages },
    { headers: { "Cache-Control": "no-store" } },
  );
}
