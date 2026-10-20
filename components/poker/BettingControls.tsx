"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatChips, formatTime } from "@/lib/utils";
import { sendAction } from "@/lib/client/api";
import { actionsForYou, isYourTurn, turnRemaining } from "@/lib/poker/client-actions";
import type { RoomSnapshot } from "@/types/room";

export function BettingControls({
  snapshot,
  onUpdate,
}: {
  snapshot: RoomSnapshot;
  onUpdate: (s: RoomSnapshot) => void;
}) {
  const legal = actionsForYou(snapshot);
  const yours = isYourTurn(snapshot);
  const [raiseTo, setRaiseTo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const bet = legal.find((a) => a.type === "bet" || a.type === "raise");
  const call = legal.find((a) => a.type === "call");
  const min = bet?.min ?? 0;
  const max = bet?.max ?? 0;
  const value = raiseTo ?? min;
  const remaining = snapshot.game
    ? turnRemaining(snapshot.game, snapshot.serverTime - Date.now())
    : 0;

  const pot = snapshot.game?.pot ?? 0;

  async function act(type: "fold" | "check" | "call" | "bet" | "raise" | "all-in", amount?: number) {
    setBusy(true);
    try {
      const data = await sendAction(snapshot.roomCode, type, amount);
      if (data.snapshot) onUpdate(data.snapshot);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const presets = useMemo(() => {
    if (!bet) return [];
    return [
      { label: "Min", amount: min },
      { label: "1/2 Pot", amount: Math.min(max, Math.max(min, Math.round(pot / 2) + (snapshot.you?.currentBet ?? 0))) },
      { label: "Pot", amount: Math.min(max, Math.max(min, pot + (snapshot.you?.currentBet ?? 0))) },
      { label: "All In", amount: max },
    ];
  }, [bet, max, min, pot, snapshot.you?.currentBet]);

  if (!snapshot.game || snapshot.status === "lobby" || snapshot.game.phase === "complete") {
    return null;
  }

  if (snapshot.game.phase === "showdown") {
    return (
      <div className="safe-bottom relative z-40 border-t border-white/10 bg-[#0c0a0d]/95 px-4 py-3 text-center">
        <p className="font-display text-lg text-gold-bright">
          {snapshot.game.lastAction ?? "Showdown"}
        </p>
        <p className="text-xs text-white/50">Next hand starts automatically</p>
      </div>
    );
  }

  if (!yours) {
    const current = snapshot.players.find((p) => p.seatNumber === snapshot.game?.currentSeat);
    return (
      <div className="safe-bottom relative z-40 border-t border-white/10 bg-[#0c0a0d]/95 px-4 py-3 text-center">
        <p className="text-sm text-white/70">
          {current ? `Waiting on ${current.displayName}` : "Waiting..."}
        </p>
        {snapshot.game.lastAction && (
          <p className="text-xs text-gold/70">{snapshot.game.lastAction}</p>
        )}
      </div>
    );
  }

  return (
    <div className="safe-bottom relative z-40 shrink-0 border-t border-gold/20 bg-[#120c10]/95 px-3 py-2 sm:px-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="font-display text-base tracking-wide text-gold-bright sm:text-lg">Your turn</p>
          <p className="rounded-full bg-burgundy px-3 py-1 font-mono text-sm">{formatTime(remaining)}</p>
        </div>
        {bet && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-white/60">
              <span>Raise to {formatChips(value)}</span>
              <span>{formatChips(max)}</span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              value={value}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
              className="w-full"
            />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {presets.map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  variant="ghost"
                  onClick={() => setRaiseTo(p.amount)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {legal.some((a) => a.type === "fold") && (
            <Button variant="danger" disabled={busy} onClick={() => act("fold")}>
              Fold
            </Button>
          )}
          {legal.some((a) => a.type === "check") && (
            <Button variant="felt" disabled={busy} onClick={() => act("check")}>
              Check
            </Button>
          )}
          {call && (
            <Button variant="felt" disabled={busy} onClick={() => act("call", call.amount)}>
              Call {formatChips(call.amount ?? 0)}
            </Button>
          )}
          {bet && (
            <Button
              disabled={busy}
              onClick={() => act(bet.type === "bet" ? "bet" : "raise", value)}
            >
              {bet.type === "bet" ? "Bet" : "Raise"} {formatChips(value)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
