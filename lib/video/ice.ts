export type IceResponse = {
  iceServers: RTCIceServer[];
  turnConfigured: boolean;
  warning: string | null;
  ttlSeconds: number;
};

export function splitIceUrls(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function stunServers() {
  const configured = splitIceUrls(process.env.NEXT_PUBLIC_STUN_URLS);
  const urls = configured.length
    ? configured
    : ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"];
  return [{ urls }] satisfies RTCIceServer[];
}

/** Browser fallback if the ICE API is unreachable. STUN only — no public TURN secrets. */
export function rtcConfiguration(): RTCConfiguration {
  return {
    iceServers: stunServers(),
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };
}
