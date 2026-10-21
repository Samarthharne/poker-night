import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/admin/rate-limit";
import { loadRoomPlayer } from "@/lib/api/guard";
import { buildIceResponse } from "./ice-server";

export async function iceServersResponse(req: Request, code: string) {
  if (!rateLimit(clientKey(req, "webrtc-ice"), 30, 60_000)) {
    return NextResponse.json({ error: "Too many ICE requests." }, { status: 429 });
  }
  if (!code) {
    return NextResponse.json({ error: "Join a room first." }, { status: 400 });
  }
  const loaded = await loadRoomPlayer(req, code);
  if ("error" in loaded) return loaded.error;
  const ice = buildIceResponse();
  const secret = process.env.ADMIN_SESSION_SECRET ?? "local-dev-secret";
  const channel = `rtc-${createHmac("sha256", secret).update(loaded.room.id).digest("hex").slice(0, 24)}`;
  return NextResponse.json(
    {
      ...ice,
      channel,
      roomId: loaded.room.id,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
