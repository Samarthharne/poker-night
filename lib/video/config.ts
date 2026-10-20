export type VideoProviderId = "local" | "livekit";

export function getVideoProvider(): VideoProviderId {
  if (
    process.env.NEXT_PUBLIC_LIVEKIT_URL &&
    process.env.LIVEKIT_API_KEY &&
    process.env.LIVEKIT_API_SECRET
  ) {
    return "livekit";
  }
  return "local";
}

export function getPublicVideoConfig() {
  return {
    provider: getVideoProvider(),
    livekitUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? null,
    configured: getVideoProvider() === "livekit",
  };
}
