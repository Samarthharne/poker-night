const OPEN_RELAY_USER = "openrelayproject";
const OPEN_RELAY_PASS = "openrelayproject";

export function rtcConfiguration(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.relay.metered.ca:80" },
  ];

  const turnUrls = (process.env.NEXT_PUBLIC_TURN_URLS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME ?? process.env.TURN_USERNAME ?? "";
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? process.env.TURN_CREDENTIAL ?? "";

  if (turnUrls.length && username && credential) {
    iceServers.push({ urls: turnUrls, username, credential });
  } else {
    iceServers.push({
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:80?transport=tcp",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
        "turns:openrelay.metered.ca:443?transport=tcp",
      ],
      username: OPEN_RELAY_USER,
      credential: OPEN_RELAY_PASS,
    });
  }

  return {
    iceServers,
    iceCandidatePoolSize: 16,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };
}
