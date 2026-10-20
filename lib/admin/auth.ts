import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeEqual, readAdminSession, signAdminSession } from "./crypto";

export const ADMIN_COOKIE = "poker_admin";

export function adminAuthConfigured() {
  const secret = Boolean(process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.length >= 16);
  const bootstrap = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
  const supabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return secret && (bootstrap || supabase);
}

export function readAdminFromRequest(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${ADMIN_COOKIE}=([^;]+)`));
  if (!match?.[1]) return null;
  try {
    return readAdminSession(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function requireAdmin(req: Request) {
  const session = readAdminFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Administrator sign-in required." }, { status: 401 });
  }
  return session;
}

export function adminCookie(email: string) {
  return {
    name: ADMIN_COOKIE,
    value: signAdminSession(email),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    },
  };
}

export async function authenticateAdmin(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    });
    if (error || !data.user?.email) return null;
    const allowed = await isAllowlistedAdmin(data.user.id, data.user.email);
    return allowed ? data.user.email.toLowerCase() : null;
  }

  const owner = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const ownerPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!owner || !ownerPassword) return null;
  if (normalized !== owner || !safeEqual(password, ownerPassword)) return null;
  return owner;
}

async function isAllowlistedAdmin(userId: string, email: string) {
  const owner = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (owner && email.toLowerCase() === owner) return true;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return false;
  }
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data } = await service
    .from("admin_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "owner" || data?.role === "admin";
}
