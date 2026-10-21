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
  onFrame,
  onAudioBlocked,
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
  onFrame?: (ready: boolean) => void;
  onAudioBlocked?: (blocked: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onFrameRef = useRef(onFrame);
  const onAudioBlockedRef = useRef(onAudioBlocked);
  const [ready, setReady] = useState(false);
  onFrameRef.current = onFrame;
  onAudioBlockedRef.current = onAudioBlocked;
  const active = enabled ?? cameraEnabled ?? cameraOn ?? Boolean(stream);
  const title = label ?? name;
  const liveVideo = Boolean(
    stream?.getVideoTracks().some((track) => track.readyState !== "ended"),
  );

  useEffect(() => {
    setReady(false);
    onFrameRef.current?.(false);
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    if (!active || !stream) {
      if (video.srcObject) video.srcObject = null;
      if (audio) audio.srcObject = null;
      setReady(false);
      onFrameRef.current?.(false);
      return;
    }
    if (video.srcObject !== stream) video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    const markReady = () => {
      setReady(true);
      onFrameRef.current?.(true);
    };
    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("loadeddata", markReady);
    video.addEventListener("playing", markReady);
    const onUnmute = () => markReady();
    stream.getVideoTracks().forEach((track) => track.addEventListener("unmute", onUnmute));
    void video.play().catch(() => undefined);
    if (video.videoWidth > 0) markReady();
    if (audio) {
      if (muted) {
        audio.srcObject = null;
        audio.pause();
        onAudioBlockedRef.current?.(false);
      } else {
        if (audio.srcObject !== stream) audio.srcObject = stream;
        audio.muted = false;
        audio.volume = 1;
        void audio.play().then(
          () => onAudioBlockedRef.current?.(false),
          () => onAudioBlockedRef.current?.(true),
        );
      }
    }
    const unlock = () => {
      void video.play().catch(() => undefined);
      if (audio && !muted) {
        void audio.play().then(
          () => onAudioBlockedRef.current?.(false),
          () => onAudioBlockedRef.current?.(true),
        );
      }
    };
    window.addEventListener("pointerdown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("playing", markReady);
      stream.getVideoTracks().forEach((track) => track.removeEventListener("unmute", onUnmute));
    };
  }, [active, muted, stream]);

  const showVideo = Boolean(active && stream && liveVideo);

  return (
    <>
      <video
        ref={videoRef}
        className={`h-full w-full object-cover${mirror ? " -scale-x-100" : ""}${showVideo ? "" : " opacity-0"}`}
        autoPlay
        playsInline
        muted
        aria-label={title}
      />
      {!showVideo && fallback}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
    </>
  );
}
