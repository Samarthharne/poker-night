"use client";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { Button } from "@/components/ui/button";
import { formatChips } from "@/lib/utils";
import type { RoomSnapshot } from "@/types/room";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useState } from "react";

export function GameSidebar({
  snapshot,
  onUpdate,
  onReset,
}: {
  snapshot: RoomSnapshot;
  onUpdate: (snapshot: RoomSnapshot) => void;
  onReset?: () => void;
}) {
  const [tab, setTab] = useState<"game" | "chat" | "players">("game");
  const game = snapshot.game;

  return (
    <aside className="hidden h-full w-[320px] shrink-0 flex-col border-l border-white/10 bg-black/30 lg:flex">
      <div className="grid grid-cols-3 border-b border-white/10">
        {(["game", "chat", "players"] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`py-3 text-xs font-semibold uppercase tracking-wider ${tab === id ? "text-[#d4b06a]" : "text-white/50"}`}
          >
            {id}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "game" && (
          <div className="space-y-2 text-sm">
            <Row label="Blinds" value={`${snapshot.smallBlind}/${snapshot.bigBlind}`} />
            <Row label="Pot" value={formatChips(game?.pot ?? 0)} />
            <Row label="Hand" value={`#${game?.handNumber ?? 0}`} />
            <Row label="Phase" value={game?.phase ?? "lobby"} />
            {process.env.NODE_ENV !== "production" && onReset && (
              <Button variant="danger" className="mt-4 w-full" onClick={onReset}>
                Reset Game
              </Button>
            )}
          </div>
        )}
        {tab === "chat" && (
          <ChatPanel snapshot={snapshot} onUpdate={onUpdate} embedded />
        )}
        {tab === "players" && (
          <div className="space-y-2">
            {snapshot.players.map((p) => (
              <div key={p.id} className="rounded-xl bg-white/5 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-semibold">{p.displayName}</span>
                  <span className={p.isConnected ? "text-emerald-400" : "text-amber-300"}>
                    {p.isConnected ? "●" : "○"}
                  </span>
                </div>
                <p className="text-xs text-[#f3d9a4]">{formatChips(p.chipBalance)} 🪙</p>
                <p className="mt-1 flex gap-2 text-xs text-white/50">
                  {p.cameraEnabled ? <Video size={12} /> : <VideoOff size={12} />}
                  {p.microphoneEnabled ? <Mic size={12} /> : <MicOff size={12} />}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded-xl bg-white/5 px-3 py-2">
      <span className="text-white/50">{label}</span>
      <span>{value}</span>
    </div>
  );
}
