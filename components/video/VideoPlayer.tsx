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
  const node = useRef<HTMLVideoElement | null>(null);
  const active = enabled ?? cameraEnabled ?? cameraOn ?? Boolean(stream);
  const title = label ?? name;

  useEffect(() => {
    const video = node.current;
    if (!video) return;
    if (!active || !stream) {
      video.srcObject = null;
      return;
    }
    if (video.srcObject !== stream) video.srcObject = stream;
    video.playsInline = true;
    video.autoplay = true;
    const play = () => {
      video.muted = true;
      void video.play().then(() => {
        video.muted = muted;
        if (!muted) video.volume = 1;
      }).catch(() => undefined);
    };
    play();
    const unlock = () => play();
    window.addEventListener("pointerdown", unlock);
    stream.getTracks().forEach((track) => {
      track.onunmute = play;
    });
    return () => {
      window.removeEventListener("pointerdown", unlock);
    };
  }, [active, muted, stream]);

  return (
    <video
      ref={node}
      className={`h-full w-full object-cover${mirror ? " -scale-x-100" : ""}`}
      autoPlay
      playsInline
      muted={muted}
      aria-label={title}
    />
  );
}
