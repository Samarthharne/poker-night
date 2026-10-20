"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useLocalMedia() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setCameraEnabled(false);
  }, []);

  const start = useCallback(async (video: boolean, audio: boolean) => {
    setError(null);
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: video
          ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
          : false,
        audio,
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = next;
      setStream(next);
      setCameraEnabled(video);
      setMicrophoneEnabled(audio);
      next.getAudioTracks().forEach((t) => {
        t.enabled = audio;
      });
      return next;
    } catch {
      setError("Camera or microphone permission was denied.");
      return null;
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraEnabled) {
      streamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
      setCameraEnabled(false);
      return false;
    }
    await start(true, microphoneEnabled);
    return true;
  }, [cameraEnabled, microphoneEnabled, start]);

  const toggleMic = useCallback(() => {
    const next = !microphoneEnabled;
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    setMicrophoneEnabled(next);
    return next;
  }, [microphoneEnabled]);

  useEffect(() => () => stop(), [stop]);

  return {
    stream,
    cameraEnabled,
    microphoneEnabled,
    speakerMuted,
    error,
    start,
    stop,
    toggleCamera,
    toggleMic,
    setSpeakerMuted,
    setCameraEnabled,
    setMicrophoneEnabled,
  };
}
