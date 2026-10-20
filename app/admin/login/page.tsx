"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/status")
      .then((r) => r.json())
      .then((data: { configured?: boolean; admin?: boolean }) => {
        setConfigured(Boolean(data.configured));
        if (data.admin) router.replace("/admin");
      });
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Sign-in failed");
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <p className="text-xs uppercase tracking-[0.3em] text-gold">Poker Night</p>
      <h1 className="font-display mt-3 text-4xl">Administrator</h1>
      <p className="mt-2 text-sm text-white/55">
        Only the application owner can sign in. There is no public registration.
      </p>
      {!configured && (
        <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-amber-100">
          Add ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_SESSION_SECRET to `.env.local`,
          or configure Supabase Auth and an `admin_roles` row. See the README.
        </p>
      )}
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div>
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label>Password</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <Button className="w-full" type="submit" disabled={busy || !configured}>
          Sign in
        </Button>
      </form>
    </main>
  );
}
