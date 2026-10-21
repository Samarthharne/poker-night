export type IceResponse = {
  iceServers: RTCIceServer[];
  turnConfigured: boolean;
  warning: string | null;
  ttlSeconds: number;
  expiresAt: number;
};

export function splitIceUrls(value: string | undefined) {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export function parseTurnUrls(value: string | undefined) {
  return splitIceUrls(value)
    .filter((url) => !url.startsWith("stun:") && !url.startsWith("stuns:"))
    .map(normalizeTurnUrl)
    .filter(Boolean) as string[];
}

function normalizeTurnUrl(url: string) {
  if (url.startsWith("turn:") || url.startsWith("turns:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return "";
  return `turn:${url}`;
}

export function stunServers() {
  const configured = splitIceUrls(process.env.NEXT_PUBLIC_STUN_URLS).filter((url) =>
    url.startsWith("stun:"),
  );
  const urls = configured.length
    ? configured
    : ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"];
  return urls.map((item) => ({ urls: item })) satisfies RTCIceServer[];
}

export function turnIceServers(urls: string[], username: string, credential: string): RTCIceServer[] {
  return urls.map((item) => ({ urls: item, username, credential }));
}

export function rtcConfiguration(iceServers?: RTCIceServer[]): RTCConfiguration {
  return {
    iceServers: iceServers?.length ? iceServers : stunServers(),
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceCandidatePoolSize: 4,
  };
}
