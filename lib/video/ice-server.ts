import { createHmac } from "crypto";
import { parseTurnUrls, stunServers, turnIceServers, type IceResponse } from "./ice";

export function mintTurnCredential(secret: string, nowMs = Date.now(), ttlSeconds = 21_600) {
  const ttl = Math.max(300, ttlSeconds);
  const expires = Math.floor(nowMs / 1000) + ttl;
  const username = `${expires}:poker`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential, expires, ttlSeconds: ttl };
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

  if (turnUrls.length && staticUser && staticPass) {
    iceServers.push(...turnIceServers(turnUrls, staticUser, staticPass));
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
      "TURN is not configured. Devices on different Wi-Fi or mobile data will usually fail. Set TURN_URLS plus TURN_SECRET or TURN_USERNAME/TURN_CREDENTIAL on the server.",
    ttlSeconds,
    expiresAt: now + ttlSeconds * 1000,
  };
}
