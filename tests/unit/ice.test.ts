import { afterEach, describe, expect, it } from "vitest";
import { rtcConfiguration } from "@/lib/video/ice";
import { buildIceResponse } from "@/lib/video/ice-server";

const keys = [
  "NEXT_PUBLIC_STUN_URLS",
  "TURN_URLS",
  "TURN_USERNAME",
  "TURN_CREDENTIAL",
  "TURN_SECRET",
  "NEXT_PUBLIC_TURN_URLS",
];

afterEach(() => {
  for (const key of keys) delete process.env[key];
});

describe("WebRTC ICE config", () => {
  it("always includes STUN and does not embed public TURN secrets in the browser fallback", () => {
    const { iceServers } = rtcConfiguration();
    const urls = iceServers.flatMap((server) =>
      Array.isArray(server.urls) ? server.urls : [server.urls],
    );
    expect(urls.some((url) => url.startsWith("stun:"))).toBe(true);
    expect(urls.some((url) => url.includes("openrelay") || url.includes("0.peerjs.com"))).toBe(false);
  });

  it("warns when TURN is missing", () => {
    const ice = buildIceResponse();
    expect(ice.turnConfigured).toBe(false);
    expect(ice.warning).toMatch(/TURN is not configured/);
  });

  it("issues time-limited TURN credentials from TURN_SECRET and never returns the secret", () => {
    process.env.TURN_URLS = "turn:turn.example:3478";
    process.env.TURN_SECRET = "super-secret-provider-key";
    const ice = buildIceResponse(1_700_000_000_000);
    expect(ice.turnConfigured).toBe(true);
    const turn = ice.iceServers.find((server) => server.username);
    expect(turn?.username).toMatch(/^\d+:poker$/);
    expect(turn?.credential).toBeTruthy();
    expect(JSON.stringify(ice)).not.toContain("super-secret-provider-key");
  });
});
