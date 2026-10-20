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
  smallBlind: number;
  bigBlind: number;
  invitationActive: boolean;
  players: Player[];
};

type OtherRoom = {
  id: string;
  name: string;
  roomCode: string;
  status: string;
  phase: string;
  connected: number;
  playerNames: string[];
  players: Player[];
};

export default function AdminRoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [link, setLink] = useState("");
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [others, setOthers] = useState<OtherRoom[]>([]);

  async function load() {
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { room: RoomDetail };
      setRoom(data.room);
      const list = await fetch("/api/admin/rooms", { cache: "no-store" });
      if (list.ok) {
        const body = (await list.json()) as { rooms: OtherRoom[] };
        setOthers(
          body.rooms
            .filter((item) => item.id !== roomId)
            .map((item) => ({ ...item, players: item.players ?? [] })),
        );
      }
    } catch {
      setMessage("Could not refresh this page. The restart may still have gone through.");
    }
  }

  useEffect(() => {
    void load();
  }, [roomId]);

  async function command(
    commandName: string,
    extra: Record<string, unknown> = {},
    options: { quiet?: boolean } = {},
  ) {
    if (!options.quiet) setPending(true);
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
        snapshot?: {
          id?: string;
          status?: string;
          players?: Player[];
          game?: { phase?: string; handNumber?: number } | null;
        };
      };
      if (!res.ok) {
        const text = data.error || "Could not update the room";
        setMessage(text);
        toast.error(text);
        return;
      }
      if (data.invitationUrl) {
        setLink(data.invitationUrl);
        if (!options.quiet) toast.success("Invitation link ready");
      } else if (commandName === "start" || commandName === "restart" || commandName === "deal-again") {
        const phase = data.snapshot?.game?.phase ?? data.snapshot?.status ?? "updated";
        const hand = data.snapshot?.game?.handNumber;
        const text = `${room?.name ?? "Room"} (${room?.roomCode ?? roomId}) is now ${phase}${hand ? `, hand ${hand}` : ""}. Open that same room code on the player screen.`;
        setMessage(text);
        toast.success(text);
      } else if (commandName === "add-chips") {
        const playerId = String(extra.playerId ?? "");
        const updated = data.snapshot?.players?.find((player) => player.id === playerId);
        if (updated && data.snapshot?.id) {
          applyChips(data.snapshot.id, updated.id, updated.chipBalance);
        }
        const text = updated
          ? `${updated.displayName} now has ${updated.chipBalance} chips.`
          : "Chips added.";
        setMessage(text);
        toast.success(text);
      }
      await load();
    } finally {
      if (!options.quiet) setPending(false);
    }
  }

  useEffect(() => {
    void command("reveal", {}, { quiet: true });
  }, [roomId]);

  function applyChips(targetRoomId: string, playerId: string, chipBalance: number) {
    if (targetRoomId === roomId) {
      setRoom((current) =>
        current
          ? {
              ...current,
              players: current.players.map((player) =>
                player.id === playerId ? { ...player, chipBalance } : player,
              ),
            }
          : current,
      );
    }
    setOthers((current) =>
      current.map((item) =>
        item.id === targetRoomId
          ? {
              ...item,
              players: item.players.map((player) =>
                player.id === playerId ? { ...player, chipBalance } : player,
              ),
            }
          : item,
      ),
    );
  }

  async function addChips(targetRoomId: string, playerId: string, amount: number) {
    setPending(true);
    try {
      const res = await fetch(`/api/rooms/${targetRoomId}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ command: "add-chips", playerId, amount }),
      });
      const data = (await res.json()) as {
        error?: string;
        snapshot?: { id?: string; players?: Player[] };
      };
      if (!res.ok) {
        const text = data.error || "Could not add chips";
        setMessage(text);
        toast.error(text);
        return;
      }
      const updated = data.snapshot?.players?.find((player) => player.id === playerId);
      if (updated) applyChips(targetRoomId, updated.id, updated.chipBalance);
      const text = updated
        ? `${updated.displayName} now has ${updated.chipBalance} chips.`
        : "Chips added.";
      setMessage(text);
      toast.success(text);
    } catch {
      const text = "Could not add chips. Try again.";
      setMessage(text);
      toast.error(text);
    } finally {
      setPending(false);
    }
  }

  async function restartOther(target: OtherRoom) {
    setPending(true);
    setMessage("");
    try {
      const res = await fetch(`/api/rooms/${target.id}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ command: "restart" }),
      });
      const data = (await res.json()) as {
        error?: string;
        snapshot?: { game?: { phase?: string; handNumber?: number } | null };
      };
      if (!res.ok) {
        const text = data.error || "Could not restart that room";
        setMessage(text);
        toast.error(text);
        return;
      }
      const phase = data.snapshot?.game?.phase ?? "playing";
      const hand = data.snapshot?.game?.handNumber;
      const text = `Restarted ${target.name} (${target.roomCode}). Players on that room should see ${phase}${hand ? `, hand ${hand}` : ""}.`;
      setMessage(text);
      toast.success(text);
    } finally {
      setPending(false);
    }
  }

  if (!room) {
    return <main className="px-5 py-10 text-white/60">Loading room...</main>;
  }

  const anyoneHere = room.players.some((player) => player.isConnected);
  const liveTable = anyoneHere
    ? null
    : (others.find((item) => item.connected > 0 && (item.players?.length ?? 0) > 0) ?? null);
  const liveElsewhere = others.filter(
    (item) => item.connected > 0 || item.status === "complete" || item.phase === "complete",
  );

  return (
    <main className="mx-auto flex h-dvh max-h-dvh max-w-3xl flex-col overflow-hidden px-3 py-3">
      <div className="shrink-0">
      <Link href="/admin" className="text-sm text-gold">
        ← Dashboard
      </Link>
      <h1 className="font-display mt-1 text-3xl">{room.name}</h1>
      <p className="mt-1 text-sm uppercase tracking-[0.2em] text-gold">Room {room.roomCode}</p>
      {!anyoneHere && liveElsewhere.length > 0 && (
        <div className="mt-3 shrink-0 rounded-2xl border border-gold/40 bg-gold/10 p-3">
          <p className="font-display text-xl">This is not the table your friends are on</p>
          <p className="mt-1 text-sm text-white/70">
            {room.name} ({room.roomCode}) has no connected players. Restarting it will not change the game on the other screen.
          </p>
          <div className="mt-4 space-y-3">
            {liveElsewhere.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  <span className="font-semibold">{item.name}</span>
                  <span className="ml-2 text-gold">Room {item.roomCode}</span>
                  <span className="mt-1 block text-white/60">
                    {item.playerNames.join(", ") || "Players seated"} · {item.status}
                    {item.phase === "complete" || item.status === "complete" ? " · match over" : ""}
                  </span>
                </p>
                <Button disabled={pending} onClick={() => restartOther(item)}>
                  {pending ? "Restarting..." : `Restart ${item.name}`}
                </Button>
              </div>
            ))}
          </div>
          {message && <p className="mt-3 text-sm text-emerald-200">{message}</p>}
        </div>
      )}
      <p className="mt-2 text-sm text-white/55">
        {room.status} · {room.phase} · blinds {room.smallBlind}/{room.bigBlind}
        {room.locked ? " · locked" : ""}
        {room.invitationActive ? " · invitation active" : " · invitation revoked"}
      </p>
      {(room.status === "complete" || room.phase === "complete") && (
        <div className="mt-6 rounded-2xl border border-gold/30 bg-gold/10 p-4">
          <p className="font-display text-2xl">Match over</p>
          <p className="mt-1 text-sm text-white/60">
            Restart gives everyone the starting stack again. Deal again keeps the chips they have now, including any you add below.
          </p>
          {room.players.every((player) => !player.isConnected) && (
            <p className="mt-2 text-sm text-red-200">
              Nobody is connected to this room. Restarting it will not change the table your friends are watching.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => command("restart")}>
              {pending ? "Working..." : "Restart match"}
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => command("deal-again")}>
              Deal again with current chips
            </Button>
          </div>
          {message && <p className="mt-3 text-sm text-emerald-200">{message}</p>}
        </div>
      )}
      <div className="mt-3 flex shrink-0 flex-wrap gap-2">
        {anyoneHere && room.status !== "complete" && room.phase !== "complete" && room.status === "lobby" && (
          <Button disabled={pending} onClick={() => command("start")}>
            Start game ({room.players.length} seated)
          </Button>
        )}
        {anyoneHere && room.status !== "complete" && room.phase !== "complete" && room.status !== "lobby" && (
          <Button variant="outline" disabled={pending} onClick={() => command("restart")}>
            Restart match
          </Button>
        )}
        <Button variant="outline" onClick={() => command("pause")}>Pause</Button>
        <Button variant="outline" onClick={() => command("resume")}>Resume</Button>
        <Button variant="outline" onClick={() => command("end")}>End game</Button>
        <Button variant="outline" onClick={() => command(room.locked ? "unlock" : "lock")}>
          {room.locked ? "Unlock" : "Lock"}
        </Button>
        <Button variant="ghost" onClick={() => command("reveal")}>Copy-ready link</Button>
        <Button variant="ghost" onClick={() => command("regenerate")}>Regenerate invitation</Button>
        <Button variant="danger" onClick={() => command("revoke")}>Revoke invitation</Button>
        <Button variant="danger" onClick={() => command("close")}>Close room</Button>
      </div>
      {link && (
        <div className="mt-4 rounded-xl bg-black/30 p-3">
          <p className="break-all text-sm">{link}</p>
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
        </div>
      )}
      </div>
      <div className="no-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto">
      {liveTable && (
        <>
          <h2 className="font-display mt-2 text-2xl">
            Players at {liveTable.name}
          </h2>
          <p className="mt-1 text-sm text-gold">Room {liveTable.roomCode}</p>
          <p className="mt-1 text-sm text-white/60">
            Add chips here. This is the table on the player screen. {room.name} is a different room.
          </p>
          <div className="mt-3 space-y-2">
            {liveTable.players.map((player) => (
              <div key={player.id} className="rounded-xl border border-gold/30 bg-white/5 px-3 py-3">
                <span>
                  {player.displayName} · seat {player.seatNumber} · {player.chipBalance} chips
                  {player.isConnected ? "" : " · away"}
                </span>
                <div className="mt-3 flex items-center gap-2">
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
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      addChips(liveTable.id, player.id, amounts[player.id] ?? 1000)
                    }
                  >
                    Add chips
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <h2 className="font-display mt-8 text-2xl">{liveTable ? room.name : "Players"}</h2>
      {liveTable && (
        <p className="mt-1 text-sm text-white/45">Nobody from this room is in the game.</p>
      )}
      <div className="mt-3 space-y-2">
        {room.players.length === 0 && <p className="text-sm text-white/45">No one has joined.</p>}
        {room.players.map((player) => (
          <div key={player.id} className="rounded-xl bg-white/5 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span>
                {player.displayName} · seat {player.seatNumber} · {player.chipBalance} chips
                {player.isConnected ? "" : " · away"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => command("kick", { playerId: player.id })}>
                Remove
              </Button>
            </div>
            <div className="mt-3 flex items-center gap-2">
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
                variant="outline"
                disabled={pending}
                onClick={() =>
                  command("add-chips", {
                    playerId: player.id,
                    amount: amounts[player.id] ?? 1000,
                  })
                }
              >
                Add chips
              </Button>
            </div>
          </div>
        ))}
      </div>
      </div>
    </main>
  );
}
