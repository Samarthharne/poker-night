"use client";

import { formatChips } from "@/lib/utils";
import type { RoomSnapshot } from "@/types/room";
import { motion } from "framer-motion";

export function EndGame({ snapshot }: { snapshot: RoomSnapshot }) {
  const ranked = [...snapshot.players].sort((a, b) => b.chipBalance - a.chipBalance);
  return (
    <div className="mx-auto max-w-lg px-4 py-10 text-center">
      <motion.h1
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="font-display text-4xl text-[#d4b06a]"
      >
        Game Complete
      </motion.h1>
      <ol className="mt-8 space-y-3">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3"
          >
            <span>
              {i + 1}. {p.displayName}
            </span>
            <span className="text-[#f3d9a4]">{formatChips(p.chipBalance)} 🪙</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-white/55">
        The match is over. Only the administrator can start a new one, from the admin dashboard.
      </p>
    </div>
  );
}
