"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useLocalMedia() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setCameraOn(false);
    setMicOn(false);
  }, []);

  const start = useCallback(async (video: boolean, audio: boolean) => {
    setError(null);
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video, audio });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = next;
      setStream(next);
      setCameraOn(video);
      setMicOn(audio);
      return next;
    } catch {
      setError("Camera or microphone permission was blocked.");
      throw new Error("Camera or microphone permission was blocked.");
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraOn && streamRef.current) {
      streamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
      const remaining = streamRef.current.getAudioTracks();
      if (remaining.length === 0) {
        stop();
        return { cameraEnabled: false, microphoneEnabled: micOn };
      }
      setCameraOn(false);
      return { cameraEnabled: false, microphoneEnabled: micOn };
    }
    const audio = micOn;
    await start(true, audio || false);
    if (!audio && streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
    }
    return { cameraEnabled: true, microphoneEnabled: audio };
  }, [cameraOn, micOn, start, stop]);

  const toggleMic = useCallback(async () => {
    if (micOn && streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
      setMicOn(false);
      return { cameraEnabled: cameraOn, microphoneEnabled: false };
    }
    await start(cameraOn, true);
    return { cameraEnabled: cameraOn, microphoneEnabled: true };
  }, [cameraOn, micOn, start]);

  useEffect(() => () => stop(), [stop]);

  return {
    stream,
    cameraOn,
    micOn,
    error,
    start,
    stop,
    toggleCamera,
    toggleMic,
    setError,
  };
}
