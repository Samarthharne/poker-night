import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTurnUrls, rtcConfiguration, splitIceUrls } from "@/lib/video/ice";
import {
  buildIceResponse,
  buildIceResponseAsync,
  meteredCredentialsUrl,
  mintTurnCredential,
} from "@/lib/video/ice-server";

const keys = [
  "NEXT_PUBLIC_STUN_URLS",
  "TURN_URLS",
  "TURN_USERNAME",
  "TURN_CREDENTIAL",
  "TURN_SECRET",
  "TURN_TTL_SECONDS",
  "METERED_API_KEY",
  "METERED_DOMAIN",
];

afterEach(() => {
  for (const key of keys) delete process.env[key];
  vi.unstubAllGlobals();
});

describe("WebRTC ICE config", () => {
  it("parses UDP, TCP, and TLS TURN URLs without inventing schemes", () => {
    const urls = parseTurnUrls(
      "turn:turn.example:3478, turn:turn.example:3478?transport=tcp, turns:turn.example:443?transport=tcp",
    );
    expect(urls).toEqual([
      "turn:turn.example:3478",
      "turn:turn.example:3478?transport=tcp",
      "turns:turn.example:443?transport=tcp",
    ]);
    expect(splitIceUrls("stun:stun.l.google.com:19302 stun:stun.cloudflare.com:3478")).toHaveLength(2);
  });

  it("browser fallback is STUN only", () => {
    const urls = rtcConfiguration().iceServers.flatMap((server) =>
      Array.isArray(server.urls) ? server.urls : [server.urls],
    );
    expect(urls.every((url) => url.startsWith("stun:"))).toBe(true);
  });

  it("warns when TURN is missing and when URLs lack credentials", () => {
    expect(buildIceResponse().turnConfigured).toBe(false);
    process.env.TURN_URLS = "turn:turn.example:3478";
    const broken = buildIceResponse();
    expect(broken.turnConfigured).toBe(false);
    expect(broken.warning).toMatch(/credentials are missing/);
  });

  it("uses Metered relay URLs when only username and password are set", () => {
    process.env.TURN_USERNAME = "metered-user";
    process.env.TURN_CREDENTIAL = "metered-pass";
    const ice = buildIceResponse();
    expect(ice.turnConfigured).toBe(true);
    const urls = ice.iceServers.flatMap((server) =>
      Array.isArray(server.urls) ? server.urls : [server.urls],
    );
    expect(urls.some((url) => url.includes("global.relay.metered.ca"))).toBe(true);
  });

  it("mints coturn REST credentials and never returns TURN_SECRET", () => {
    const minted = mintTurnCredential("super-secret-provider-key", 1_700_000_000_000, 3600);
    expect(minted.username).toMatch(/^\d+:poker$/);
    expect(minted.credential).toBeTruthy();
    process.env.TURN_URLS = "turn:turn.example:3478,turns:turn.example:443?transport=tcp";
    process.env.TURN_SECRET = "super-secret-provider-key";
    const ice = buildIceResponse(1_700_000_000_000);
    expect(ice.turnConfigured).toBe(true);
    expect(ice.iceServers.filter((server) => "username" in server)).toHaveLength(2);
    expect(JSON.stringify(ice)).not.toContain("super-secret-provider-key");
  });

  it("loads Metered ICE servers on the server and never returns the API key", async () => {
    process.env.METERED_DOMAIN = "turn-app.example";
    process.env.METERED_API_KEY = "unit-test-metered-key";
    expect(meteredCredentialsUrl()).toContain("apiKey=unit-test-metered-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { urls: "stun:stun.relay.metered.ca:80" },
        {
          urls: "turn:standard.relay.metered.ca:80",
          username: "temp-user",
          credential: "temp-pass",
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    const ice = await buildIceResponseAsync();
    expect(ice.turnConfigured).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.stringify(ice)).not.toContain("unit-test-metered-key");
    vi.unstubAllGlobals();
  });
});
