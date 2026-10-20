"use client";

import { motion } from "framer-motion";
import { formatChips } from "@/lib/utils";
import type { Card } from "@/types/poker";
import { PlayingCard } from "./PlayingCard";

export function CommunityCards({
  cards,
  pot,
  phase,
}: {
  cards: Card[];
  pot: number;
  phase: string;
}) {
  const slots = Array.from({ length: 5 }, (_, i) => cards[i] ?? null);
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-[10px] uppercase tracking-[0.28em] text-gold/80">
        {phase.replace("preflop", "pre-flop")}
      </p>
      <div className="flex items-end gap-1.5 sm:gap-2">
        {slots.map((card, i) =>
          card ? (
            <PlayingCard key={`${card.rank}${card.suit}-${i}`} card={card} size="lg" delay={i * 0.08} />
          ) : (
            <div
              key={`empty-${i}`}
              className="h-[72px] w-[50px] rounded-lg border border-dashed border-white/15 sm:h-[96px] sm:w-[68px]"
            />
          ),
        )}
      </div>
      <motion.div
        key={pot}
        initial={{ scale: 0.85, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-full border border-gold/30 bg-black/35 px-4 py-1.5 text-sm text-gold-bright"
      >
        POT: {formatChips(pot)} 🪙
      </motion.div>
    </div>
  );
}
