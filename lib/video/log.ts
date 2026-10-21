export function rtcLog(message: string, detail?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_WEBRTC_DEBUG !== "1") return;
  if (detail) console.info(`[webrtc] ${message}`, detail);
  else console.info(`[webrtc] ${message}`);
}
