import { NextResponse } from "next/server";
import { adminAuthConfigured, readAdminFromRequest } from "@/lib/admin/auth";

export async function GET(req: Request) {
  return NextResponse.json({
    configured: adminAuthConfigured(),
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    admin: Boolean(readAdminFromRequest(req)),
  });
}
