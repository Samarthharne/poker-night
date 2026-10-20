import { NextResponse } from "next/server";
import { adminAuthConfigured, adminCookie, authenticateAdmin } from "@/lib/admin/auth";
import { clientKey, rateLimit } from "@/lib/admin/rate-limit";

export async function POST(req: Request) {
  if (!adminAuthConfigured()) {
    return NextResponse.json(
      { error: "Administrator sign-in is not configured. See the README." },
      { status: 503 },
    );
  }
  if (!rateLimit(clientKey(req, "admin-login"), 8, 60_000)) {
    return NextResponse.json({ error: "Too many sign-in attempts." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const email = await authenticateAdmin(body.email ?? "", body.password ?? "");
  if (!email) {
    return NextResponse.json({ error: "Invalid administrator credentials." }, { status: 401 });
  }
  const cookie = adminCookie(email);
  const res = NextResponse.json({ ok: true, email });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
