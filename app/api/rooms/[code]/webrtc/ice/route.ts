import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { loadRoomPlayer } from "@/lib/api/guard";
import { buildIceResponse } from "@/lib/video/ice-server";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
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
