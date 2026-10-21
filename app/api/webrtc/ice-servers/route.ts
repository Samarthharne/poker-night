import { iceServersResponse } from "@/lib/video/ice-handler";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  return iceServersResponse(req, code);
}
