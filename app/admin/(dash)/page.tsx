"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

type Summary = {
  id: string;
  name: string;
  roomCode: string;
  status: string;
  locked: boolean;
  players: number;
  maxPlayers: number;
  connected: number;
  createdAt: number;
  invitationActive: boolean;
  phase: string;
  playerNames: string[];
};

type Notice = { roomId: string; ok: boolean; text: string };

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ total: 0, active: 0, connected: 0 });
  const [rooms, setRooms] = useState<Summary[]>([]);
  const [name, setName] = useState("Friday Table");
  const [chips, setChips] = useState(5000);
  const [blind, setBlind] = useState(25);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [hours, setHours] = useState(12);
  const [link, setLink] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function load() {
    const res = await fetch("/api/admin/rooms", { cache: "no-store" });
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const data = (await res.json()) as {
      total: number;
      active: number;
      connected: number;
      rooms: Summary[];
    };
    setStats({ total: data.total, active: data.active, connected: data.connected });
    setRooms(data.rooms);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          startingChips: chips,
          smallBlind: blind,
          maxPlayers,
          expiresInHours: hours,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: unknown;
        invitationUrl?: string;
        room?: Summary;
      };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Could not create the room");
        return;
      }
      const created = data.room;
      setLink(data.invitationUrl ?? "");
      if (created) {
        setRooms((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        setStats((current) => ({
          total: Math.max(current.total, 1),
          active: Math.max(current.active, 1),
          connected: current.connected,
        }));
      }
      toast.success("Private room created");
      await load().catch(() => undefined);
      if (created) {
        setRooms((current) =>
          current.some((item) => item.id === created.id) ? current : [created, ...current],
        );
        setStats((stats) => ({
          total: Math.max(stats.total, 1),
          active: Math.max(stats.active, 1),
          connected: stats.connected,
        }));
      }
    } catch {
      toast.error("Could not create the room");
    } finally {
      setCreating(false);
    }
  }

  async function runRoom(roomId: string, commandName: "start" | "restart") {
    setPendingId(roomId);
    setNotice(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ command: commandName }),
      });
      const data = (await res.json()) as {
        error?: string;
        snapshot?: { status?: string; game?: { phase?: string; handNumber?: number } | null };
      };
      if (!res.ok) {
        const text = data.error || "Could not update the room";
        setNotice({ roomId, ok: false, text });
        toast.error(text);
        return;
      }
      const phase = data.snapshot?.game?.phase ?? data.snapshot?.status ?? "updated";
      const hand = data.snapshot?.game?.handNumber;
      const text =
        commandName === "restart"
          ? `Match restarted. Now ${phase}${hand ? `, hand ${hand}` : ""}.`
          : `Game started. Now ${phase}${hand ? `, hand ${hand}` : ""}.`;
      setNotice({ roomId, ok: true, text });
      toast.success(text);
      await load();
    } catch {
      const text = "Could not reach the server.";
      setNotice({ roomId, ok: false, text });
      toast.error(text);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Administrator</p>
          <h1 className="font-display text-4xl">Poker Night</h1>
        </div>
        <Button
          variant="ghost"
          onClick={async () => {
            await fetch("/api/admin/logout", { method: "POST" });
            router.replace("/admin/login");
          }}
        >
          Log out
        </Button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Total rooms" value={stats.total} />
        <Stat label="Active rooms" value={stats.active} />
        <Stat label="Connected players" value={stats.connected} />
      </div>
      <form className="glass-card mt-8 space-y-4 rounded-3xl p-5" onSubmit={create}>
        <h2 className="font-display text-2xl">Create room</h2>
        <div>
          <Label>Room name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Starting chips</Label>
            <Input type="number" min={100} value={chips} onChange={(e) => setChips(Number(e.target.value))} />
          </div>
          <div>
            <Label>Small blind</Label>
            <Input type="number" min={1} value={blind} onChange={(e) => setBlind(Number(e.target.value))} />
          </div>
          <div>
            <Label>Maximum players</Label>
            <Input type="number" min={2} max={9} value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} />
          </div>
          <div>
            <Label>Expires in hours</Label>
            <Input type="number" min={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          </div>
        </div>
        <p className="text-xs text-white/45">Big blind is twice the small blind. Texas Hold&apos;em, virtual chips only.</p>
        <Button type="submit" disabled={creating}>
          {creating ? "Creating..." : "Create room"}
        </Button>
        {link && (
          <div className="rounded-xl bg-black/30 p-3">
            <p className="text-xs text-white/50">Invitation link — share this with your friends.</p>
            <p className="mt-1 break-all text-sm">{link}</p>
            <Button
              className="mt-3"
              variant="outline"
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                toast.success("Invitation link copied");
              }}
            >
              Copy invitation link
            </Button>
          </div>
        )}
      </form>
      <section className="mt-8">
        <h2 className="font-display text-2xl">Tables with players</h2>
        <div className="mt-4 space-y-2">
          {rooms.filter((room) => room.connected > 0 || room.status === "complete" || room.phase === "complete").length === 0 && (
            <p className="text-sm text-white/45">No one is connected right now.</p>
          )}
          {rooms
            .filter((room) => room.connected > 0 || room.status === "complete" || room.phase === "complete")
            .map((room) => {
              const over = room.status === "complete" || room.phase === "complete";
              return (
                <div key={room.id} className="glass-card rounded-2xl px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href={`/admin/rooms/${room.id}`} className="min-w-0">
                      <span className="font-semibold">{room.name}</span>
                      <span className="ml-2 text-xs uppercase text-gold">Room {room.roomCode}</span>
                      <span className="ml-2 text-xs uppercase text-white/45">
                        {over ? "match over" : room.status}
                      </span>
                      <span className="mt-1 block text-sm text-white/55">
                        {room.playerNames.join(", ")} · {room.connected} connected
                      </span>
                    </Link>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gold">
                        {room.players}/{room.maxPlayers}
                      </span>
                      {over ? (
                        <Button
                          size="sm"
                          disabled={pendingId === room.id}
                          onClick={() => runRoom(room.id, "restart")}
                        >
                          {pendingId === room.id ? "Restarting..." : `Restart ${room.name}`}
                        </Button>
                      ) : room.status === "lobby" ? (
                        <Button
                          size="sm"
                          disabled={pendingId === room.id}
                          onClick={() => runRoom(room.id, "start")}
                        >
                          {pendingId === room.id ? "Starting..." : `Start ${room.name}`}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pendingId === room.id}
                          onClick={() => runRoom(room.id, "restart")}
                        >
                          {pendingId === room.id ? "Restarting..." : `Restart ${room.name}`}
                        </Button>
                      )}
                    </div>
                  </div>
                  {notice?.roomId === room.id && (
                    <p className={`mt-3 text-sm ${notice.ok ? "text-emerald-300" : "text-red-300"}`}>
                      {notice.text}
                    </p>
                  )}
                </div>
              );
            })}
        </div>
        <h2 className="font-display mt-8 text-2xl">Empty rooms</h2>
        <p className="mt-1 text-sm text-white/45">
          These tables have no connected players, so restarting them does not change the game your friends are in.
        </p>
        <div className="mt-4 space-y-2">
          {rooms.filter((room) => room.connected === 0 && room.status !== "complete" && room.phase !== "complete").length === 0 && (
            <p className="text-sm text-white/45">No empty rooms.</p>
          )}
          {rooms
            .filter((room) => room.connected === 0 && room.status !== "complete" && room.phase !== "complete")
            .map((room) => (
              <Link
                key={room.id}
                href={`/admin/rooms/${room.id}`}
                className="glass-card block rounded-2xl px-4 py-3"
              >
                <span className="font-semibold">{room.name}</span>
                <span className="ml-2 text-xs uppercase text-white/45">{room.status}</span>
                <span className="mt-1 block text-sm text-white/55">
                  {room.playerNames.length > 0 ? room.playerNames.join(", ") : "No one seated"} · not connected
                </span>
              </Link>
            ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-xs uppercase tracking-wider text-white/45">{label}</p>
      <p className="font-display mt-1 text-3xl">{value}</p>
    </div>
  );
}
