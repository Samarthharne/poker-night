import { NextResponse } from "next/server";
import { getVideoProvider } from "@/lib/video/config";
import { jsonError, loadRoom, requirePlayer } from "@/lib/auth";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const room = await loadRoom(code, req);
    requirePlayer(req, room);

    if (getVideoProvider() !== "livekit") {
      return NextResponse.json({
        provider: "local",
        configured: false,
        token: null,
        url: null,
        message:
          "LiveKit is not configured. Local camera preview still works. Add NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to enable multi-user video.",
      });
    }

    return NextResponse.json({
      provider: "livekit",
      configured: true,
      token: null,
      url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
      message:
        "LiveKit credentials are present. Install livekit-server-sdk and wire token minting to finish video rooms.",
    });
  } catch (error) {
    const { message, status } = jsonError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
