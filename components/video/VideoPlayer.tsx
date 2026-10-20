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
    video.muted = muted;
    if (!active || !stream) {
      if (video.srcObject) video.srcObject = null;
      return;
    }
    if (video.srcObject !== stream) video.srcObject = stream;
    const play = () => {
      video.muted = true;
      void video.play().then(() => {
        if (!muted) video.muted = false;
      }).catch(() => undefined);
    };
    play();
    stream.getVideoTracks().forEach((track) => {
      track.onunmute = play;
    });
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
