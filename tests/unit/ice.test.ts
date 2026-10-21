import { describe, expect, it } from "vitest";
import { rtcConfiguration } from "@/lib/video/ice";

describe("WebRTC ICE config", () => {
  it("includes STUN and a TURN relay so a second laptop can connect", () => {
    const { iceServers } = rtcConfiguration();
    const urls = iceServers.flatMap((server) =>
      Array.isArray(server.urls) ? server.urls : [server.urls],
    );
    expect(urls.some((url) => url.startsWith("stun:"))).toBe(true);
    expect(urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"))).toBe(true);
  });
});
