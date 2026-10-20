"use client";

import { create } from "zustand";

type MediaState = {
  cameraOn: boolean;
  micOn: boolean;
  speakerOn: boolean;
  stream: MediaStream | null;
  error: string | null;
  expandedPlayerId: string | null;
  setExpandedPlayerId: (id: string | null) => void;
  start: (video: boolean, audio: boolean) => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleMic: () => void;
  toggleSpeaker: () => void;
  stop: () => void;
};

export const useMediaStore = create<MediaState>((set, get) => ({
  cameraOn: false,
  micOn: false,
  speakerOn: true,
  stream: null,
  error: null,
  expandedPlayerId: null,
  setExpandedPlayerId: (expandedPlayerId) => set({ expandedPlayerId }),
  start: async (video, audio) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video
          ? { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" }
          : false,
        audio,
      });
      set({
        stream,
        cameraOn: video,
        micOn: audio,
        error: null,
      });
    } catch {
      set({
        error: "Camera or microphone permission was blocked.",
        cameraOn: false,
        micOn: false,
      });
    }
  },
  toggleCamera: async () => {
    const { stream, cameraOn, micOn, start, stop } = get();
    if (cameraOn) {
      stream?.getVideoTracks().forEach((t) => t.stop());
      const audio = stream?.getAudioTracks() ?? [];
      if (audio.length === 0) {
        stop();
        set({ cameraOn: false });
        return;
      }
      audio.forEach((t) => {
        t.enabled = micOn;
      });
      set({
        cameraOn: false,
        stream: new MediaStream(audio),
      });
      return;
    }
    await start(true, micOn);
  },
  toggleMic: () => {
    const { stream, micOn } = get();
    stream?.getAudioTracks().forEach((t) => {
      t.enabled = !micOn;
    });
    set({ micOn: !micOn });
  },
  toggleSpeaker: () => set({ speakerOn: !get().speakerOn }),
  stop: () => {
    get().stream?.getTracks().forEach((t) => t.stop());
    set({ stream: null, cameraOn: false, micOn: false });
  },
}));
