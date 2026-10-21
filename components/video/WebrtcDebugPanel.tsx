"use client";

import { Button } from "@/components/ui/button";
import type { PeerDiagnostics } from "@/lib/video/peer-session";

function visible() {
  return true;
}

export function WebrtcDebugPanel({
  diagnostics,
  localAudio,
  localVideo,
  turnConfigured,
  turnWarning,
  iceFetchStatus,
  onTestCamera,
  onTestMic,
  onReconnect,
  onRestartIce,
  onForceRelay,
  forceRelay,
}: {
  diagnostics: Record<string, PeerDiagnostics>;
  localAudio: boolean;
  localVideo: boolean;
  turnConfigured: boolean;
  turnWarning: string | null;
  iceFetchStatus: "pending" | "ok" | "error" | "missing-turn";
  onTestCamera: () => void;
  onTestMic: () => void;
  onReconnect: (peerId?: string) => void;
  onRestartIce: (peerId: string) => void;
  onForceRelay: (next: boolean) => void;
  forceRelay: boolean;
}) {
  if (!visible()) return null;
  const rows = Object.values(diagnostics);

  function copyReport() {
    const report = {
      at: new Date().toISOString(),
      localAudio,
      localVideo,
      turnConfigured,
      turnWarning,
      iceFetchStatus,
      peers: rows.map((row) => ({
        playerId: row.playerId,
        connectionState: row.connectionState,
        iceConnectionState: row.iceConnectionState,
        iceGatheringState: row.iceGatheringState,
        signalingState: row.signalingState,
        candidateType: row.candidateType,
        transport: row.transport,
        remoteAudio: row.remoteAudio,
        remoteVideo: row.remoteVideo,
        videoFrame: row.videoFrame,
        lastError: row.lastError,
        retryAttempt: row.retryAttempt,
      })),
    };
    void navigator.clipboard.writeText(JSON.stringify(report, null, 2));
  }

  return (
    <div className="fixed bottom-2 right-2 z-50 max-h-[45vh] max-w-sm overflow-auto rounded-xl border border-white/15 bg-black/85 p-2 font-mono text-[10px] text-white/80">
      <p className="font-semibold text-gold">WebRTC diagnostics</p>
      <p>Local cam {localVideo ? "on" : "off"} · mic {localAudio ? "on" : "off"}</p>
      <p>
        TURN {turnConfigured ? "configured" : "missing"} · ice {iceFetchStatus} · peers {rows.length}
      </p>
      {turnWarning && <p className="text-amber-200">{turnWarning}</p>}
      {forceRelay && <p className="text-sky-300">Relay-only ICE is on (diagnostic).</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" onClick={onTestCamera}>
          Test Camera
        </Button>
        <Button size="sm" variant="ghost" onClick={onTestMic}>
          Test Microphone
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onReconnect()}>
          Reconnect Peer
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onForceRelay(!forceRelay)}>
          {forceRelay ? "ICE all" : "Relay only"}
        </Button>
        <Button size="sm" variant="ghost" onClick={copyReport}>
          Copy Diagnostic Report
        </Button>
      </div>
      {rows.length === 0 && <p className="mt-2">No remote peers yet.</p>}
      {rows.map((row) => (
        <div key={row.playerId} className="mt-2 border-t border-white/10 pt-2">
          <p>
            peer {row.playerId.slice(0, 8)} · {row.offerer ? "offerer" : "answerer"}
          </p>
          <p>pc {row.connectionState} · ice {row.iceConnectionState}</p>
          <p>gather {row.iceGatheringState} · sdp {row.signalingState}</p>
          <p>
            remote a/v {row.remoteAudio ? "audio" : "-"}/{row.remoteVideo ? "video" : "-"} frame{" "}
            {row.videoFrame ? "yes" : "no"}
          </p>
          <p>
            pair {row.candidateType}/{row.transport} · retry {row.retryAttempt}
          </p>
          {row.lastError && <p className="text-rose-300">{row.lastError}</p>}
          <button
            type="button"
            className="mt-1 underline"
            onClick={() => onRestartIce(row.playerId)}
          >
            Restart ICE
          </button>
        </div>
      ))}
    </div>
  );
}
