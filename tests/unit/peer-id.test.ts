import { describe, expect, it } from "vitest";
import { hydratePlayerId, peerName, playerIdFromPeer, streamForPlayer } from "@/lib/video/peer-id";

const playerId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("PeerJS player ids", () => {
  it("maps a PeerJS name back to the dashed player id", () => {
    const name = peerName("WDV99QK", playerId);
    expect(playerIdFromPeer(name, [playerId])).toBe(playerId);
    expect(playerIdFromPeer(name, [])).toBe(playerId);
    expect(peerName("WDV99QK", playerId).startsWith("pwdv99qk")).toBe(true);
  });

  it("hydrates a dashless uuid so remote faces bind to the seat", () => {
    expect(hydratePlayerId(playerId.replace(/-/g, ""))).toBe(playerId);
  });

  it("finds a remote stream when the seat id has different dashes", () => {
    const stream = { id: "media-1" } as MediaStream;
    expect(streamForPlayer({ [playerId.replace(/-/g, "")]: stream }, playerId)).toBe(stream);
  });
});
