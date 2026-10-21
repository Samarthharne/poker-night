import { describe, expect, it } from "vitest";
import {
  isExpiredMessage,
  isOfferer,
  isStaleSession,
  mergeRtcMessages,
  nextRetryDelay,
  pairSessionId,
  parseRtcMessage,
  queueIceCandidate,
  signalingAllowed,
} from "@/lib/video/rtc-protocol";
import {
  canApplyMessage,
  glareDecision,
  shouldIceRestart,
  shouldOffer,
  shouldPollOffer,
  shouldRebuild,
  shouldRetryStuckOffer,
} from "@/lib/video/peer-session";

const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("offerer selection", () => {
  it("picks one stable offerer from normalized player ids", () => {
    expect(isOfferer(a, b)).toBe(true);
    expect(isOfferer(b, a)).toBe(false);
    expect(shouldOffer(a.replace(/-/g, "").toUpperCase(), b)).toBe(true);
    expect(pairSessionId(a, b)).toBe(pairSessionId(b, a));
  });
});

describe("offer polling", () => {
  it("does not send a new offer while ICE is still connecting", () => {
    expect(
      shouldPollOffer({
        connectionState: "connecting",
        iceConnectionState: "checking",
        signalingState: "stable",
        hasRemoteDescription: true,
      }),
    ).toBe(false);
    expect(
      shouldPollOffer({
        connectionState: "new",
        iceConnectionState: "new",
        signalingState: "stable",
        hasRemoteDescription: false,
      }),
    ).toBe(true);
    expect(shouldRetryStuckOffer("have-local-offer", false, Date.now() - 6_000)).toBe(true);
    expect(shouldRetryStuckOffer("have-local-offer", false, Date.now() - 1_000)).toBe(false);
  });
});

describe("room-backed signaling", () => {
  it("keeps unique live offers from two instances", () => {
    const offer = {
      id: "offer-1",
      roomId: "room-1",
      from: a,
      to: b,
      type: "offer" as const,
      sessionId: "sess-1",
      createdAt: Date.now(),
      payload: { sdp: { type: "offer", sdp: "v=0" } },
    };
    const merged = mergeRtcMessages([offer], [{ ...offer, id: "offer-2", createdAt: Date.now() }]);
    expect(merged.map((item) => item.id).sort()).toEqual(["offer-1", "offer-2"]);
    expect(mergeRtcMessages([offer], [{ ...offer, createdAt: Date.now() - 30_000 }])).toHaveLength(1);
  });

  it("fills an empty roomId from the authenticated room", () => {
    const parsed = parseRtcMessage(
      { id: "msg-2", to: b, type: "offer", sessionId: "sess-1", roomId: "", payload: { sdp: { type: "offer", sdp: "v=0" } } },
      { roomId: "room-1", from: a },
    );
    expect(parsed?.roomId).toBe("room-1");
  });
});

describe("signaling isolation", () => {
  it("rejects cross-room and self signaling", () => {
    expect(
      signalingAllowed({
        senderId: a,
        targetId: b,
        memberIds: [a, b],
        roomId: "room-1",
        messageRoomId: "room-2",
      }),
    ).toBe(false);
    expect(
      signalingAllowed({
        senderId: a,
        targetId: a,
        memberIds: [a, b],
        roomId: "room-1",
        messageRoomId: "room-1",
      }),
    ).toBe(false);
    expect(
      signalingAllowed({
        senderId: a,
        targetId: b,
        memberIds: [a, b],
        roomId: "room-1",
        messageRoomId: "room-1",
      }),
    ).toBe(true);
  });
});

describe("ICE candidate queue", () => {
  it("holds early candidates until the remote description is ready", () => {
    const first = queueIceCandidate([], { candidate: "cand-1", sdpMid: "0" }, false);
    expect(first.apply).toEqual([]);
    expect(first.queued).toHaveLength(1);
    const second = queueIceCandidate(first.queued, { candidate: "cand-2", sdpMid: "0" }, true);
    expect(second.apply).toHaveLength(1);
  });
});

describe("duplicate and stale signaling", () => {
  const offer = {
    id: "msg-1",
    roomId: "room-1",
    from: a,
    to: b,
    type: "offer" as const,
    sessionId: "sess-1",
    createdAt: Date.now(),
    payload: { sdp: { type: "offer", sdp: "v=0" } },
  };

  it("drops duplicates and expired messages", () => {
    expect(canApplyMessage("sess-1", offer, new Set(["msg-1"])).ok).toBe(false);
    expect(isExpiredMessage({ createdAt: Date.now() - 30_000 })).toBe(true);
    expect(canApplyMessage("sess-1", { ...offer, createdAt: Date.now() - 30_000 }, new Set()).ok).toBe(
      false,
    );
  });

  it("ignores stale candidates from an old negotiation", () => {
    expect(isStaleSession("sess-2", "sess-1")).toBe(true);
    expect(
      canApplyMessage("sess-2", { ...offer, type: "ice-candidate", sessionId: "sess-1" }, new Set())
        .ok,
    ).toBe(false);
    expect(canApplyMessage("sess-2", { ...offer, sessionId: "sess-2" }, new Set()).ok).toBe(true);
  });
});

describe("perfect negotiation glare", () => {
  it("impolite offerer ignores a colliding offer", () => {
    const glare = glareDecision({
      selfId: a,
      peerId: b,
      makingOffer: true,
      signalingState: "have-local-offer",
      incomingType: "offer",
    });
    expect(glare.ignore).toBe(true);
  });

  it("polite peer rolls back on glare", () => {
    const glare = glareDecision({
      selfId: b,
      peerId: a,
      makingOffer: true,
      signalingState: "have-local-offer",
      incomingType: "offer",
    });
    expect(glare.rollback).toBe(true);
  });
});

describe("retries", () => {
  it("uses bounded backoff and stops rebuilding after five attempts", () => {
    expect(nextRetryDelay(0, 0)).toBeGreaterThan(0);
    expect(nextRetryDelay(8, 0)).toBeLessThanOrEqual(16_000);
    expect(shouldRebuild("failed", "failed", 5)).toBe(false);
    expect(shouldIceRestart("disconnected", "disconnected", 1)).toBe(true);
  });
});

describe("legacy payload parse", () => {
  it("accepts the older offer shape used during deploy overlap", () => {
    const parsed = parseRtcMessage(
      { to: b, description: { type: "offer", sdp: "v=0" } },
      { roomId: "room-1", from: a },
    );
    expect(parsed?.type).toBe("offer");
    expect(parseRtcMessage({ to: a }, { roomId: "room-1", from: a })).toBeNull();
  });
});
