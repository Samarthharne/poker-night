"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function mediaErrorMessage(error: unknown) {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Allow camera and microphone in the browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera or microphone was found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "The camera or microphone is already in use by another app.";
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Camera and microphone need a secure HTTPS page.";
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
    return "This browser cannot use the camera or microphone.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not start camera or microphone.";
}

async function requestStream(video: boolean, audio: boolean) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser cannot use the camera or microphone.");
  }
  const attempts: MediaStreamConstraints[] = [];
  if (video && audio) {
    attempts.push(
      { video: true, audio: true },
      { video: { facingMode: "user" }, audio: { echoCancellation: true, noiseSuppression: true } },
    );
  }
  if (video) attempts.push({ video: true, audio: false });
  if (audio) attempts.push({ video: false, audio: true });
  let lastError: unknown;
  for (const constraints of attempts) {
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
        next.getVideoTracks().forEach((track) => {
          track.enabled = video;
          track.onended = () => {
            if (streamRef.current === next) setCameraEnabled(false);
          };
        });
        next.getAudioTracks().forEach((track) => {
          track.enabled = audio;
          track.onended = () => {
            if (streamRef.current === next) setMicrophoneEnabled(false);
          };
        });
        const camera = video && next.getVideoTracks().some((track) => track.readyState === "live");
        const mic = audio && next.getAudioTracks().some((track) => track.readyState === "live");
        if (video && !camera) setError("Camera could not start. Check permission and try again.");
        else if (audio && !mic) setError("Microphone could not start. Check permission and try again.");
        publish(next, camera, mic);
        return next;
      } catch (caught) {
        setError(mediaErrorMessage(caught));
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
      setError(null);
      return true;
    }
    const next = await start(true, microphoneEnabled || Boolean(current?.getAudioTracks().length));
    return Boolean(next?.getVideoTracks().some((track) => track.enabled && track.readyState === "live"));
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
      setError(null);
      return true;
    }
    const next = await start(cameraEnabled || Boolean(current?.getVideoTracks().length), true);
    return Boolean(next?.getAudioTracks().some((track) => track.enabled && track.readyState === "live"));
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

export { mediaErrorMessage };
