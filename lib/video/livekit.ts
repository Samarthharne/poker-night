export type LiveKitJoinRequest = {
  roomCode: string;
  playerId: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
};

/**
 * LiveKit adapter.
 * When NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET
 * are set, mint a room token in /api/video and connect the JS SDK here.
 */
export async function connectLiveKit(_request: LiveKitJoinRequest) {
  return {
    provider: "local" as const,
    reason:
      "LiveKit is not configured. Local camera preview is active; remote streams require LiveKit env vars.",
  };
}
