"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/input";
import { sendHost } from "@/lib/client/api";
import { formatChips, initials } from "@/lib/utils";
import type { RoomSnapshot } from "@/types/room";
import { PlayerSeat } from "@/components/poker/PlayerSeat";

export function Lobby({
  snapshot,
  onUpdate,
  localStream,
  remoteStreams,
  localId,
  isAdmin,
  hostCode,
}: {
  snapshot: RoomSnapshot;
  onUpdate: (s: RoomSnapshot) => void;
  localStream: MediaStream | null;
  remoteStreams?: Record<string, MediaStream>;
  localId?: string;
  isAdmin?: boolean;
  hostCode?: string;
}) {
  const you = snapshot.you;
  const isHost = Boolean(you?.isHost) || Boolean(isAdmin);
  const canStart = snapshot.players.filter((p) => p.isConnected || p.chipBalance > 0).length >= 2;
  const [turnSeconds, setTurnSeconds] = useState(snapshot.turnSeconds || 30);
  const seats = Array.from({ length: Math.max(snapshot.maxPlayers, 6) }, (_, i) => i + 1);

  async function host(command: string, extra: Record<string, unknown> = {}) {
    try {
      const data = await sendHost(hostCode ?? snapshot.roomCode, { command, ...extra });
      if (data.snapshot) onUpdate(data.snapshot);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update room");
    }
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-3 overflow-hidden px-3 py-3">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold/70">Waiting room</p>
        <h1 className="font-display text-3xl">{snapshot.name}</h1>
        <p className="text-white/60">
          {snapshot.players.length}/{snapshot.maxPlayers} seated · Blinds {snapshot.smallBlind}/{snapshot.bigBlind}
        </p>
      </div>

      <div className="felt-table wood-rail mx-auto h-24 w-full max-w-xl shrink-0 rounded-[999px] sm:h-28" />
      <div className="grid max-h-[52vh] min-h-[220px] flex-1 grid-cols-2 content-start gap-2 overflow-y-scroll px-1 pb-8 sm:grid-cols-3">
        {seats.map((seat) => {
          const player = snapshot.players.find((item) => item.seatNumber === seat);
          if (!player) {
            return (
              <div
                key={seat}
                className="flex min-h-[110px] items-center justify-center rounded-2xl border border-dashed border-white/20 bg-black/25 text-center text-xs text-white/40"
              >
                Seat {seat}
                <span className="ml-1 block sm:inline">Empty</span>
              </div>
            );
          }
          return (
            <div key={player.id} className="flex justify-center">
              <PlayerSeat
                player={player}
                dealerSeat={null}
                smallBlindSeat={null}
                bigBlindSeat={null}
                isTurn={false}
                compact
                localStream={player.id === localId ? localStream : null}
                remoteStream={remoteStreams?.[player.id] ?? null}
                isYou={player.id === localId}
              />
            </div>
          );
        })}
      </div>

      {isHost ? (
        <div className="glass-card mx-auto w-full max-w-xl shrink-0 space-y-3 rounded-3xl p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[140px]">
              <Label>Turn / bid time (s)</Label>
              <Input
                type="number"
                min={10}
                max={180}
                value={turnSeconds}
                onChange={(e) => setTurnSeconds(Number(e.target.value))}
              />
            </div>
            <Button disabled={!canStart} onClick={() => host("start", { turnSeconds })}>
              Start Game
            </Button>
            {process.env.NODE_ENV !== "production" && (
              <Button variant="ghost" onClick={() => host("add-bot")}>
                Add practice seat
              </Button>
            )}
            <Button variant="outline" onClick={() => host(snapshot.locked ? "unlock" : "lock")}>
              {snapshot.locked ? "Unlock room" : "Lock room"}
            </Button>
            {process.env.NODE_ENV !== "production" && (
              <Button variant="ghost" onClick={() => host("add-bot")}>
                Add practice player
              </Button>
            )}
          </div>
          {!canStart && <p className="text-sm text-white/50">Need at least 2 players to start.</p>}
          <HostSettings snapshot={snapshot} onSave={(body) => host("settings", body)} />
        </div>
      ) : (
        <p className="text-center text-white/60">Waiting for the administrator to start the game.</p>
      )}
    </div>
  );
}

function HostSettings({
  snapshot,
  onSave,
}: {
  snapshot: RoomSnapshot;
  onSave: (body: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        onSave({
          startingChips: Number(form.get("startingChips")),
          smallBlind: Number(form.get("smallBlind")),
          maxPlayers: Number(form.get("maxPlayers")),
          turnSeconds: Number(form.get("turnSeconds")),
        });
      }}
    >
      <div>
        <Label>Starting chips</Label>
        <Input name="startingChips" type="number" defaultValue={snapshot.startingChips} min={100} />
      </div>
      <div>
        <Label>Small blind</Label>
        <Input name="smallBlind" type="number" defaultValue={snapshot.smallBlind} min={1} />
      </div>
      <div>
        <Label>Max players</Label>
        <select
          name="maxPlayers"
          defaultValue={snapshot.maxPlayers}
          className="min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3"
        >
          {[2, 4, 6, 8, 9].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Turn time (seconds)</Label>
        <Input name="turnSeconds" type="number" min={10} max={180} defaultValue={snapshot.turnSeconds || 30} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" variant="ghost" size="sm">
          Save settings
        </Button>
        <span className="ml-2 text-xs text-white/40">Big blind stays 2× small blind · default turn 30s</span>
      </div>
    </form>
  );
}

export function EmptyInitials({ name }: { name: string }) {
  return <span>{initials(name)}</span>;
}
