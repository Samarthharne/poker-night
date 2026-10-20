"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendChat } from "@/lib/client/api";
import { toast } from "sonner";
import type { ChatMessage } from "@/types/room";
import type { RoomSnapshot } from "@/types/room";

const REACTIONS = ["😂", "🔥", "👏", "😮", "GG"];

export function ChatPanel({
  snapshot,
  onUpdate,
  onClose,
  embedded,
}: {
  snapshot: RoomSnapshot;
  onUpdate: (s: RoomSnapshot) => void;
  onClose?: () => void;
  embedded?: boolean;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [snapshot.messages.length]);

  async function send(message: string) {
    if (!message.trim()) return;
    try {
      const data = await sendChat(snapshot.roomCode, message.trim());
      if (data.snapshot) onUpdate(data.snapshot);
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chat failed");
    }
  }

  return (
    <div className={embedded ? "flex h-full flex-col" : "flex h-[70vh] flex-col"}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="font-display tracking-wide">Chat</p>
        {onClose && (
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {snapshot.messages.length === 0 && (
          <p className="text-sm text-white/40">Say hi to the table.</p>
        )}
        {snapshot.messages.map((m: ChatMessage) => (
          <div key={m.id}>
            <p className="text-xs text-gold/70">
              {m.displayName} · {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="text-sm">{m.message}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="space-y-2 border-t border-white/10 p-3">
        <div className="flex gap-1">
          {REACTIONS.map((r) => (
            <button
              key={r}
              type="button"
              className="min-h-11 flex-1 rounded-lg bg-white/5 text-lg"
              onClick={() => send(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
          />
          <Button type="submit" size="sm" className="px-3">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
