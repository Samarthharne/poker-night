import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readAdminSession } from "@/lib/admin/crypto";
import { ADMIN_COOKIE } from "@/lib/admin/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const session = readAdminSession(jar.get(ADMIN_COOKIE)?.value);
  if (!session) redirect("/admin/login");
  return <div className="min-h-dvh">{children}</div>;
}
