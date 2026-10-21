import { iceServersResponse } from "@/lib/video/ice-handler";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  return iceServersResponse(req, code);
}
