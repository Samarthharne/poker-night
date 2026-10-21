"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function VideoPlayer({
  stream,
  enabled,
  cameraEnabled,
  cameraOn,
  muted = true,
  mirror = false,
  label,
  name,
  fallback,
}: {
  stream?: MediaStream | null;
  enabled?: boolean;
  cameraEnabled?: boolean;
  cameraOn?: boolean;
  muted?: boolean;
  mirror?: boolean;
  label?: string;
  name?: string;
  fallback?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const active = enabled ?? cameraEnabled ?? cameraOn ?? Boolean(stream);
  const title = label ?? name;
  const liveVideo = Boolean(
    stream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled),
  );

  useEffect(() => {
    setReady(false);
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    if (!active || !stream) {
      if (video.srcObject) video.srcObject = null;
      if (audio) audio.srcObject = null;
      setReady(false);
      return;
    }
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.muted = true;
    video.playsInline = true;
    const markReady = () => {
      if (video.videoWidth > 0) setReady(true);
    };
    video.addEventListener("loadeddata", markReady);
    video.addEventListener("playing", markReady);
    void video.play().catch(() => undefined);
    if (audio) {
      if (muted) {
        audio.srcObject = null;
        audio.pause();
      } else if (audio.srcObject !== stream) {
        audio.srcObject = stream;
        audio.muted = false;
        audio.volume = 1;
        void audio.play().catch(() => undefined);
      } else {
        void audio.play().catch(() => undefined);
      }
    }
    const unlock = () => {
      void video.play().catch(() => undefined);
      if (audio && !muted) void audio.play().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("playing", markReady);
    };
  }, [active, muted, stream]);

  const showVideo = Boolean(active && stream && liveVideo && ready);

  return (
    <>
      <video
        ref={videoRef}
        className={`h-full w-full object-cover${mirror ? " -scale-x-100" : ""}${showVideo ? "" : " opacity-0"}`}
        autoPlay
        playsInline
        muted
        aria-label={title}
        onPlaying={() => {
          if (videoRef.current && videoRef.current.videoWidth > 0) setReady(true);
        }}
      />
      {!showVideo && fallback}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
    </>
  );
}
