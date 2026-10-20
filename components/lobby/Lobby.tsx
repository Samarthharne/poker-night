"use client";

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
}: {
  snapshot: RoomSnapshot;
  onUpdate: (s: RoomSnapshot) => void;
  localStream: MediaStream | null;
  remoteStreams?: Record<string, MediaStream>;
  localId?: string;
}) {
  const you = snapshot.you;
  const isHost = Boolean(you?.isHost);
  const canStart = snapshot.players.filter((p) => p.isConnected).length >= 2;

  async function host(command: string, extra: Record<string, unknown> = {}) {
    try {
      const data = await sendHost(snapshot.roomCode, { command, ...extra });
      if (data.snapshot) onUpdate(data.snapshot);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update room");
    }
  }

  const seats = Array.from({ length: snapshot.maxPlayers }, (_, i) => i + 1);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold/70">Waiting room</p>
        <h1 className="font-display text-3xl">{snapshot.name}</h1>
        <p className="text-white/60">
          {snapshot.players.length}/{snapshot.maxPlayers} seated · Blinds {snapshot.smallBlind}/{snapshot.bigBlind}
        </p>
      </div>

      <div className="relative mx-auto w-full max-w-4xl">
        <div className="felt-table wood-rail mx-auto aspect-2/1 w-full max-w-[920px] rounded-[999px]" />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {seats.map((seat) => {
            const player = snapshot.players.find((p) => p.seatNumber === seat);
            if (!player) {
              return (
                <div
                  key={seat}
                  className="glass-card flex min-h-[120px] items-center justify-center rounded-3xl text-sm text-white/40"
                >
                  Seat {seat} · Empty
                </div>
              );
            }
            return (
              <div key={player.id} className="flex flex-col items-center gap-2">
                <PlayerSeat
                  player={player}
                  dealerSeat={null}
                  smallBlindSeat={null}
                  bigBlindSeat={null}
                  isTurn={false}
                  localStream={player.id === localId ? localStream : null}
                  remoteStream={remoteStreams?.[player.id] ?? null}
                  isYou={player.id === localId}
                />
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                  {player.isReady ? "Ready" : "Joining"}
                </span>
                {isHost && !player.isHost && (
                  <Button size="sm" variant="ghost" onClick={() => host("kick", { playerId: player.id })}>
                    Remove
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isHost ? (
        <div className="glass-card mx-auto w-full max-w-xl space-y-4 rounded-3xl p-5">
          <div className="flex flex-wrap gap-2">
            <Button disabled={!canStart} onClick={() => host("start")}>
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
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        onSave({
          startingChips: Number(form.get("startingChips")),
          smallBlind: Number(form.get("smallBlind")),
          maxPlayers: Number(form.get("maxPlayers")),
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
      <div className="sm:col-span-3">
        <Button type="submit" variant="ghost" size="sm">
          Save settings
        </Button>
        <span className="ml-2 text-xs text-white/40">Big blind stays 2× small blind · 🪙 {formatChips(snapshot.startingChips)}</span>
      </div>
    </form>
  );
}

export function EmptyInitials({ name }: { name: string }) {
  return <span>{initials(name)}</span>;
}
