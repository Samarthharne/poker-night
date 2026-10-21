"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { joinRoom } from "@/lib/client/api";
import type { RoomSnapshot } from "@/types/room";

type MediaLike = {
  stream: MediaStream | null;
  error: string | null;
  start: (video: boolean, audio: boolean) => Promise<unknown>;
  cameraEnabled?: boolean;
  microphoneEnabled?: boolean;
  cameraOn?: boolean;
  micOn?: boolean;
  toggleCamera?: () => Promise<unknown>;
  toggleMic?: () => unknown;
};

export function JoinGate({
  code,
  roomName,
  media,
  onJoined,
  onJoin,
  onLeave,
}: {
  code: string;
  roomName?: string;
  media: MediaLike;
  onJoined?: (snapshot: RoomSnapshot) => void;
  onJoin?: (input: {
    displayName: string;
    cameraEnabled: boolean;
    microphoneEnabled: boolean;
  }) => Promise<void>;
  onLeave?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const cameraOn = media.cameraEnabled ?? media.cameraOn ?? false;
  const micOn = media.microphoneEnabled ?? media.micOn ?? false;

  useEffect(() => {
    if (media.stream || cameraOn) return;
    void media.start(true, true);
  }, [cameraOn, media.stream, media.start]);

  async function join() {
    setBusy(true);
    try {
      const started =
        media.stream ?? ((await media.start(true, true)) as MediaStream | null | undefined);
      const cameraEnabled = Boolean(started?.getVideoTracks().some((track) => track.enabled));
      const microphoneEnabled = Boolean(started?.getAudioTracks().some((track) => track.enabled));
      if (onJoin) {
        await onJoin({
          displayName: name,
          cameraEnabled,
          microphoneEnabled,
        });
        return;
      }
      const data = await joinRoom(code, {
        displayName: name,
        cameraEnabled,
        microphoneEnabled,
      });
      if (data.snapshot) onJoined?.(data.snapshot);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <p className="text-xs uppercase tracking-[0.3em] text-gold">Poker Night</p>
      <h1 className="font-display mt-2 text-4xl">{roomName || `Room ${code}`}</h1>
      <p className="mt-2 text-white/60">Enter a display name. No account needed.</p>
      <div className="mt-6 space-y-4">
        <div>
          <Label>Display name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="overflow-hidden rounded-3xl bg-black">
          <div className="aspect-video">
            <VideoPlayer stream={media.stream} enabled={cameraOn} muted label="Preview" />
          </div>
        </div>
        {media.error && <p className="text-sm text-rose-300">{media.error}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (media.toggleCamera) void media.toggleCamera();
              else void media.start(!cameraOn, micOn);
            }}
          >
            Camera {cameraOn ? "On" : "Off"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (media.toggleMic) media.toggleMic();
              else void media.start(cameraOn, !micOn);
            }}
          >
            Mic {micOn ? "On" : "Off"}
          </Button>
        </div>
        <Button className="w-full" disabled={busy || name.trim().length < 2} onClick={() => void join()}>
          Join Game
        </Button>
        <Button className="w-full" variant="ghost" onClick={onLeave ?? (() => router.push("/"))}>
          Leave
        </Button>
      </div>
    </div>
  );
}
