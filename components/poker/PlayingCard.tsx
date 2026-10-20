"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Card } from "@/types/poker";

const SUIT: Record<Card["suit"], { glyph: string; red: boolean }> = {
  h: { glyph: "♥", red: true },
  d: { glyph: "♦", red: true },
  s: { glyph: "♠", red: false },
  c: { glyph: "♣", red: false },
};

const RANK: Record<Card["rank"], string> = {
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  T: "10",
  J: "J",
  Q: "Q",
  K: "K",
  A: "A",
};

export function PlayingCard({
  card,
  hidden,
  size = "md",
  delay = 0,
  highlight = false,
}: {
  card?: Card | null;
  hidden?: boolean;
  size?: "sm" | "md" | "lg";
  delay?: number;
  highlight?: boolean;
}) {
  const dims =
    size === "lg"
      ? "w-[68px] h-[96px] sm:w-[78px] sm:h-[110px]"
      : size === "sm"
        ? "w-[38px] h-[54px]"
        : "w-[48px] h-[68px] sm:w-[58px] sm:h-[82px]";

  if (hidden || !card) {
    return (
      <motion.div
        initial={{ y: -24, opacity: 0, rotate: -8 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 18, delay }}
        className={cn(
          dims,
          "rounded-lg border border-[#d4b15a]/40 shadow-lg",
          "bg-[repeating-linear-gradient(135deg,#6b1c2c_0_8px,#4a101c_8px_16px)]",
        )}
      />
    );
  }

  const suit = SUIT[card.suit];
  return (
    <motion.div
      initial={{ y: -28, opacity: 0, rotateY: 80 }}
      animate={{ y: 0, opacity: 1, rotateY: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 16, delay }}
      className={cn(
        dims,
        "relative rounded-lg bg-[#fbf7ee] p-1 shadow-xl select-none",
        highlight ? "ring-2 ring-gold shadow-[0_0_18px_rgba(212,177,90,0.55)]" : "border border-black/10",
        suit.red ? "text-[#c11c2d]" : "text-[#16151a]",
      )}
    >
      <div className="flex h-full flex-col justify-between">
        <div className="leading-none">
          <div className="font-semibold text-[0.95em]">{RANK[card.rank]}</div>
          <div className="-mt-0.5 text-[0.9em]">{suit.glyph}</div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center text-2xl sm:text-3xl opacity-90">
          {suit.glyph}
        </div>
        <div className="self-end rotate-180 leading-none">
          <div className="font-semibold text-[0.95em]">{RANK[card.rank]}</div>
          <div className="-mt-0.5 text-[0.9em]">{suit.glyph}</div>
        </div>
      </div>
    </motion.div>
  );
}
