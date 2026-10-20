"use client";

import { Button } from "@/components/ui/button";
import { Copy, Menu, Share2, Wifi } from "lucide-react";

export function TopBar({
  roomName,
  roomCode,
  players,
  max,
  connected,
  onInvite,
  onMenu,
}: {
  roomName: string;
  roomCode: string;
  players: number;
  max: number;
  connected: boolean;
  onInvite: () => void;
  onMenu: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 lg:px-5">
      <div className="min-w-0">
        <p className="font-display text-lg tracking-wide">Poker Night</p>
        <p className="truncate text-xs text-white/55">
          {roomName} · {roomCode}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1 text-xs text-white/70 sm:flex">
          <span className={connected ? "text-emerald-400" : "text-amber-300"}>●</span>
          {connected ? "Connected" : "Reconnecting"}
        </span>
        <span className="rounded-full bg-white/5 px-3 py-2 text-xs">
          👥 {players}/{max}
        </span>
        <Button className="hidden sm:inline-flex" onClick={onInvite}>
          <Copy size={14} className="mr-2" /> Invite
        </Button>
        <Button className="sm:hidden" variant="outline" onClick={onInvite}>
          <Share2 size={16} />
        </Button>
        <button
          className="grid h-11 w-11 place-items-center rounded-xl bg-white/5 lg:hidden"
          onClick={onMenu}
          aria-label="Menu"
        >
          <Menu size={18} />
        </button>
        <Wifi className="hidden text-emerald-400 lg:block" size={16} />
      </div>
    </header>
  );
}
