"use client";

import { useEffect, useRef } from "react";

export function VideoPlayer({
  stream,
  enabled,
  cameraEnabled,
  cameraOn,
  muted = true,
  mirror = false,
  label,
  name,
}: {
  stream?: MediaStream | null;
  enabled?: boolean;
  cameraEnabled?: boolean;
  cameraOn?: boolean;
  muted?: boolean;
  mirror?: boolean;
  label?: string;
  name?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const active = enabled ?? cameraEnabled ?? cameraOn ?? Boolean(stream);
  const title = label ?? name;
  const trackKey = stream?.getTracks().map((track) => `${track.id}:${track.readyState}:${track.enabled}`).join("|") ?? "";

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    if (!active || !stream) {
      video.srcObject = null;
      if (audio) audio.srcObject = null;
      return;
    }
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    void video.play().catch(() => undefined);
    if (audio) {
      if (muted) {
        audio.srcObject = null;
        audio.pause();
      } else {
        audio.srcObject = stream;
        audio.muted = false;
        audio.volume = 1;
        void audio.play().catch(() => undefined);
      }
    }
    const unlock = () => {
      void video.play().catch(() => undefined);
      if (audio && !muted) void audio.play().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, [active, muted, stream, trackKey]);

  return (
    <>
      <video
        ref={videoRef}
        className={`h-full w-full object-cover${mirror ? " -scale-x-100" : ""}`}
        autoPlay
        playsInline
        muted
        aria-label={title}
      />
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
    </>
  );
}
