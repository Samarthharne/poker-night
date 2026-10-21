"use client";

import { useCallback, useEffect, useRef, useState } from "react";

async function requestStream(video: boolean, audio: boolean) {
  const attempts: MediaStreamConstraints[] = [
    {
      video: video ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false,
      audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
    },
    { video: video ? true : false, audio },
    { video: false, audio: true },
    { video: true, audio: false },
  ];
  let lastError: unknown;
  for (const constraints of attempts) {
    const wantsVideo = Boolean(constraints.video);
    const wantsAudio = Boolean(constraints.audio);
    if (video && !wantsVideo && audio && !wantsAudio) continue;
    if (!video && wantsVideo) continue;
    if (!audio && wantsAudio && video) continue;
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Camera or microphone permission was denied.");
}

export function useLocalMedia() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const publish = useCallback((next: MediaStream | null, camera: boolean, mic: boolean) => {
    streamRef.current = next;
    setStream(next);
    setCameraEnabled(camera);
    setMicrophoneEnabled(mic);
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    publish(null, false, false);
  }, [publish]);

  const start = useCallback(
    async (video: boolean, audio: boolean) => {
      setError(null);
      try {
        const next = await requestStream(video, audio);
        streamRef.current?.getTracks().forEach((track) => {
          if (!next.getTracks().some((item) => item.id === track.id)) track.stop();
        });
        const camera = next.getVideoTracks().some((track) => track.readyState === "live");
        const mic = next.getAudioTracks().some((track) => track.readyState === "live");
        next.getAudioTracks().forEach((track) => {
          track.enabled = audio;
        });
        next.getVideoTracks().forEach((track) => {
          track.enabled = video;
        });
        publish(next, camera && video, mic && audio);
        return next;
      } catch {
        setError("Allow camera and microphone to see and hear the other players.");
        return null;
      }
    },
    [publish],
  );

  const toggleCamera = useCallback(async () => {
    const current = streamRef.current;
    if (cameraEnabled && current) {
      current.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
      setCameraEnabled(false);
      return false;
    }
    const live = current?.getVideoTracks().find((track) => track.readyState === "live");
    if (live) {
      live.enabled = true;
      setCameraEnabled(true);
      return true;
    }
    const next = await start(true, microphoneEnabled || Boolean(current?.getAudioTracks().length));
    return Boolean(next?.getVideoTracks().some((track) => track.enabled));
  }, [cameraEnabled, microphoneEnabled, start]);

  const toggleMic = useCallback(async () => {
    const current = streamRef.current;
    if (microphoneEnabled && current) {
      current.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      setMicrophoneEnabled(false);
      return false;
    }
    const live = current?.getAudioTracks().find((track) => track.readyState === "live");
    if (live) {
      live.enabled = true;
      setMicrophoneEnabled(true);
      return true;
    }
    const next = await start(cameraEnabled || Boolean(current?.getVideoTracks().length), true);
    return Boolean(next?.getAudioTracks().some((track) => track.enabled));
  }, [cameraEnabled, microphoneEnabled, start]);

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
