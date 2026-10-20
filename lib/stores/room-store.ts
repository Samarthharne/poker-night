"use client";

import { create } from "zustand";
import type { RoomSnapshot } from "@/types/room";

type RoomStore = {
  snapshot: RoomSnapshot | null;
  connected: boolean;
  setSnapshot: (snapshot: RoomSnapshot) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
};

export const useRoomStore = create<RoomStore>((set) => ({
  snapshot: null,
  connected: false,
  setSnapshot: (snapshot) => set({ snapshot }),
  setConnected: (connected) => set({ connected }),
  reset: () => set({ snapshot: null, connected: false }),
}));
