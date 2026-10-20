"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Player = {
  id: string;
  displayName: string;
  seatNumber: number;
  chipBalance: number;
  isConnected: boolean;
};

type RoomDetail = {
  id: string;
  name: string;
  roomCode: string;
  status: string;
  locked: boolean;
  phase: string;
  paused: boolean;
  handNumber: number;
  lastAction: string;
  smallBlind: number;
  bigBlind: number;
  invitationActive: boolean;
  players: Player[];
};

export default function AdminRoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [link, setLink] = useState("");
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/admin/rooms/${roomId}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { room: RoomDetail };
    setRoom(data.room);
  }

  useEffect(() => {
    void load();
    const refresh = setInterval(() => void load(), 2500);
    return () => clearInterval(refresh);
  }, [roomId]);

  async function command(commandName: string, extra: Record<string, unknown> = {}) {
    setPending(commandName);
    try {
      const res = await fetch(`/api/rooms/${roomId}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ command: commandName, ...extra }),
      });
      const data = (await res.json()) as {
        error?: string;
        invitationUrl?: string;
        snapshot?: { status?: string; game?: { phase?: string; handNumber?: number; paused?: boolean } | null };
      };
      if (!res.ok) {
        const text = data.error || "Could not update the room";
        setMessage(text);
        toast.error(text);
        return;
      }
      if (data.invitationUrl) {
        setLink(data.invitationUrl);
        toast.success("Invitation link ready");
      } else {
        const phase = data.snapshot?.game?.phase ?? data.snapshot?.status ?? commandName;
        const text = `${commandName} · ${phase}${data.snapshot?.game?.handNumber ? `, hand ${data.snapshot.game.handNumber}` : ""}`;
        setMessage(text);
        toast.success(text);
      }
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  useEffect(() => {
    void fetch(`/api/rooms/${roomId}/host`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "reveal" }),
    })
      .then((res) => res.json())
      .then((data: { invitationUrl?: string }) => {
        if (data.invitationUrl) setLink(data.invitationUrl);
      })
      .catch(() => undefined);
  }, [roomId]);

  if (!room) {
    return <main className="px-5 py-10 text-white/60">Loading room...</main>;
  }

  const lobby = room.status === "lobby" || room.phase === "lobby" || !room.phase || room.phase === "waiting";
  const playing = room.status === "playing" || room.status === "paused" || Boolean(room.phase && room.phase !== "lobby" && room.phase !== "waiting" && room.phase !== "complete");
  const over = room.status === "complete" || room.phase === "complete";
  const busy = Boolean(pending);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/admin" className="text-sm text-gold">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-2 text-4xl">{room.name}</h1>
      <p className="mt-1 text-sm uppercase tracking-[0.2em] text-gold">Room {room.roomCode}</p>
      <p className="mt-2 text-sm text-white/55">
        {room.paused ? "paused" : room.status} · {room.phase}
        {room.handNumber ? ` · hand ${room.handNumber}` : ""} · blinds {room.smallBlind}/{room.bigBlind}
        {room.locked ? " · locked" : ""}
      </p>
      {room.lastAction && <p className="mt-1 text-sm text-gold/80">{room.lastAction}</p>}
      {message && <p className="mt-2 text-sm text-emerald-300">{message}</p>}

      <section className="glass-card mt-6 rounded-3xl p-5">
        <h2 className="font-display text-2xl">Manage game</h2>
        <p className="mt-1 text-sm text-white/50">These controls apply to this room only. Players see the change on their table.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button disabled={busy || !lobby || room.players.length < 2} onClick={() => command("start")}>
            {pending === "start" ? "Starting..." : "Start"}
          </Button>
          <Button variant="outline" disabled={busy || !playing || room.paused} onClick={() => command("pause")}>
            {pending === "pause" ? "Pausing..." : "Pause"}
          </Button>
          <Button variant="outline" disabled={busy || !playing || !room.paused} onClick={() => command("resume")}>
            {pending === "resume" ? "Resuming..." : "Resume"}
          </Button>
          <Button variant="outline" disabled={busy || room.players.length < 2} onClick={() => command("restart")}>
            {pending === "restart" ? "Restarting..." : "Restart"}
          </Button>
          <Button variant="outline" disabled={busy || (!playing && !over)} onClick={() => command("end")}>
            {pending === "end" ? "Ending..." : "End game"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => command(room.locked ? "unlock" : "lock")}>
            {room.locked ? "Unlock" : "Lock"}
          </Button>
        </div>
      </section>

      <section className="glass-card mt-6 rounded-3xl p-5">
        <h2 className="font-display text-2xl">Players · add chips</h2>
        <p className="mt-1 text-sm text-white/50">{room.players.length} seated. Add coins to a stack without restarting the hand.</p>
        <div className="mt-4 space-y-3">
          {room.players.length === 0 && <p className="text-sm text-white/45">No one has joined this room yet.</p>}
          {room.players.map((player) => (
            <div key={player.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{player.displayName}</p>
                  <p className="text-sm text-white/50">
                    Seat {player.seatNumber} · {player.chipBalance} chips · {player.isConnected ? "connected" : "away"}
                  </p>
                </div>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => command("kick", { playerId: player.id })}>
                  Remove
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={1000000}
                  className="max-w-[140px]"
                  value={amounts[player.id] ?? 1000}
                  onChange={(e) =>
                    setAmounts((current) => ({ ...current, [player.id]: Number(e.target.value) }))
                  }
                  aria-label={`Chips to add for ${player.displayName}`}
                />
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    command("add-chips", {
                      playerId: player.id,
                      amount: amounts[player.id] ?? 1000,
                    })
                  }
                >
                  {pending === "add-chips" ? "Adding..." : "Add chips"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 p-5">
        <h2 className="font-display text-xl">Invitation</h2>
        {link ? (
          <>
            <p className="mt-2 break-all text-sm">{link}</p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                toast.success("Invitation link copied");
              }}
            >
              Copy invitation link
            </Button>
          </>
        ) : (
          <p className="mt-2 text-sm text-white/45">No active invitation.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => command("regenerate")}>
            New invitation
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={() => command("revoke")}>
            Revoke invitation
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={() => command("close")}>
            Close room
          </Button>
        </div>
      </section>
    </main>
  );
}
