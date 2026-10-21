import { createHmac } from "crypto";
import { parseTurnUrls, stunServers, turnIceServers, type IceResponse } from "./ice";

const METERED_TURN_URLS = [
  "turn:global.relay.metered.ca:80",
  "turn:global.relay.metered.ca:80?transport=tcp",
  "turn:global.relay.metered.ca:443",
  "turns:global.relay.metered.ca:443?transport=tcp",
];

export function mintTurnCredential(secret: string, nowMs = Date.now(), ttlSeconds = 21_600) {
  const ttl = Math.max(300, ttlSeconds);
  const expires = Math.floor(nowMs / 1000) + ttl;
  const username = `${expires}:poker`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential, expires, ttlSeconds: ttl };
}

export function meteredCredentialsUrl() {
  const apiKey = process.env.METERED_API_KEY ?? "";
  if (!apiKey) return null;
  const host = (process.env.METERED_DOMAIN ?? "poker-night.metered.live").replace(/^https?:\/\//, "");
  return `https://${host}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
}

function asIceServers(payload: unknown): RTCIceServer[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { iceServers?: unknown }).iceServers)
      ? (payload as { iceServers: unknown[] }).iceServers
      : [];
  const servers: RTCIceServer[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const entry = item as RTCIceServer;
    if (!entry.urls) continue;
    servers.push({
      urls: entry.urls,
      ...(entry.username ? { username: String(entry.username) } : {}),
      ...(entry.credential ? { credential: String(entry.credential) } : {}),
    });
  }
  return servers;
}

export async function fetchMeteredIceServers() {
  const url = meteredCredentialsUrl();
  if (!url) return null;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Metered TURN returned ${response.status}`);
  }
  return asIceServers(await response.json());
}

export function buildIceResponse(now = Date.now()): IceResponse {
  const iceServers: RTCIceServer[] = [...stunServers()];
  const turnUrls = parseTurnUrls(process.env.TURN_URLS);
  const staticUser = process.env.TURN_USERNAME ?? "";
  const staticPass = process.env.TURN_CREDENTIAL ?? "";
  const secret = process.env.TURN_SECRET ?? "";
  const ttlSeconds = Math.max(300, Number(process.env.TURN_TTL_SECONDS ?? 21_600) || 21_600);

  if (turnUrls.length && secret) {
    const minted = mintTurnCredential(secret, now, ttlSeconds);
    iceServers.push(...turnIceServers(turnUrls, minted.username, minted.credential));
    return {
      iceServers,
      turnConfigured: true,
      warning: null,
      ttlSeconds: minted.ttlSeconds,
      expiresAt: minted.expires * 1000,
    };
  }

  if (staticUser && staticPass) {
    const urls = turnUrls.length ? turnUrls : METERED_TURN_URLS;
    iceServers.push(...turnIceServers(urls, staticUser, staticPass));
    return {
      iceServers,
      turnConfigured: true,
      warning: null,
      ttlSeconds,
      expiresAt: now + ttlSeconds * 1000,
    };
  }

  if (turnUrls.length) {
    return {
      iceServers,
      turnConfigured: false,
      warning:
        "TURN_URLS is set but credentials are missing. Set TURN_SECRET (coturn REST) or TURN_USERNAME and TURN_CREDENTIAL.",
      ttlSeconds,
      expiresAt: now + ttlSeconds * 1000,
    };
  }

  return {
    iceServers,
    turnConfigured: false,
    warning:
      "TURN is not configured. Set METERED_API_KEY (and METERED_DOMAIN) or TURN_URLS plus TURN_SECRET / TURN_USERNAME.",
    ttlSeconds,
    expiresAt: now + ttlSeconds * 1000,
  };
}

export async function buildIceResponseAsync(now = Date.now()): Promise<IceResponse> {
  const ttlSeconds = Math.max(300, Number(process.env.TURN_TTL_SECONDS ?? 21_600) || 21_600);
  try {
    const metered = await fetchMeteredIceServers();
    if (metered && metered.some((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
    })) {
      return {
        iceServers: metered,
        turnConfigured: true,
        warning: null,
        ttlSeconds,
        expiresAt: now + ttlSeconds * 1000,
      };
    }
  } catch {
    /* fall through to static / coturn env */
  }
  return buildIceResponse(now);
}
