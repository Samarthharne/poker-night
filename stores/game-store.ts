"use client";

import { create } from "zustand";
import type { ChatMessage, RoomSnapshot } from "@/types/room";
import type { PublicPlayer } from "@/types/player";

type Connection = "connecting" | "connected" | "offline";

type GameSlice = {
  snapshot: RoomSnapshot | null;
  connection: Connection;
  applySnapshot: (snapshot: RoomSnapshot) => void;
  setConnection: (connection: Connection) => void;
  reset: () => void;
};

export const useGameStore = create<GameSlice>((set) => ({
  snapshot: null,
  connection: "connecting",
  applySnapshot: (snapshot) => set({ snapshot, connection: "connected" }),
  setConnection: (connection) => set({ connection }),
  reset: () => set({ snapshot: null, connection: "connecting" }),
}));

export const useChatStore = create<{
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
}>((set) => ({
  messages: [],
  setMessages: (messages) => set({ messages }),
}));

export function selectPlayers(s: GameSlice): PublicPlayer[] {
  return s.snapshot?.players ?? [];
}
