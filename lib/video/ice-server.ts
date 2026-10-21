import { createHmac } from "crypto";
import { splitIceUrls, stunServers, type IceResponse } from "./ice";

export function buildIceResponse(now = Date.now()): IceResponse {
  const iceServers: RTCIceServer[] = [...stunServers()];
  const turnUrls = splitIceUrls(process.env.TURN_URLS ?? process.env.NEXT_PUBLIC_TURN_URLS);
  const staticUser = process.env.TURN_USERNAME ?? "";
  const staticPass = process.env.TURN_CREDENTIAL ?? "";
  const secret = process.env.TURN_SECRET ?? "";
  const ttlSeconds = Math.max(60, Number(process.env.TURN_TTL_SECONDS ?? 3600) || 3600);

  if (turnUrls.length && secret) {
    const expires = Math.floor(now / 1000) + ttlSeconds;
    const username = `${expires}:poker`;
    iceServers.push({
      urls: turnUrls,
      username,
      credential: createHmac("sha1", secret).update(username).digest("base64"),
    });
    return { iceServers, turnConfigured: true, warning: null, ttlSeconds };
  }

  if (turnUrls.length && staticUser && staticPass) {
    iceServers.push({ urls: turnUrls, username: staticUser, credential: staticPass });
    return { iceServers, turnConfigured: true, warning: null, ttlSeconds };
  }

  return {
    iceServers,
    turnConfigured: false,
    warning:
      "TURN is not configured. Friends on other networks may not see or hear each other. Set TURN_URLS plus TURN_SECRET or TURN_USERNAME/TURN_CREDENTIAL.",
    ttlSeconds,
  };
}
