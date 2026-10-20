"use client";

import Link from "next/link";
import { Camera, Link2, Spade, Users } from "lucide-react";

const steps = [
  { n: "1", title: "The owner opens a private room", icon: Spade },
  { n: "2", title: "You receive an invitation link", icon: Link2 },
  { n: "3", title: "Turn on your camera", icon: Camera },
  { n: "4", title: "Play Texas Hold'em", icon: Users },
];

export function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#7a1d2c55,transparent_45%),radial-gradient(ellipse_at_bottom,#145c3a66,transparent_50%)]" />
      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-10">
        <p className="font-display text-xl tracking-[0.2em]">POKER NIGHT</p>
        <Link href="/admin/login" className="text-sm text-white/50 hover:text-gold">
          Administrator
        </Link>
      </header>
      <main className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-5 pb-20 pt-10 text-center sm:pt-20">
        <p className="text-xs uppercase tracking-[0.38em] text-gold">
          Private table
        </p>
        <h1 className="font-display mt-4 text-5xl leading-tight sm:text-7xl">
          Poker Night
        </h1>
        <p className="mt-4 max-w-xl text-lg text-white/75 sm:text-2xl">
          Play Poker. See Your Friends. Have Fun.
        </p>
        <p className="mt-2 max-w-xl text-base text-white/70">
          Your friends. Your table. Your game.
        </p>
        <p className="mt-3 max-w-lg text-sm text-white/50 sm:text-base">
          This is an invite-only play-money table. Friends join only with a link
          from the administrator. Virtual chips only — just for fun.
        </p>
        <div className="felt-table wood-rail mt-16 aspect-2/1 w-full max-w-3xl rounded-[999px] opacity-90" />
        <section className="mt-20 w-full">
          <h2 className="font-display text-2xl">How it works</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.n} className="glass-card rounded-3xl p-5 text-left">
                <step.icon className="h-5 w-5 text-gold" />
                <p className="mt-4 text-xs uppercase tracking-[0.2em] text-gold/70">
                  Step {step.n}
                </p>
                <p className="mt-1 text-lg">{step.title}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
