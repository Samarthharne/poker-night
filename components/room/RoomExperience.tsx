"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CameraOff,
  Copy,
  LogOut,
  Menu,
  Mic,
  MicOff,
  Share2,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Lobby } from "@/components/lobby/Lobby";
import { BettingControls } from "@/components/poker/BettingControls";
import { PokerTable } from "@/components/poker/PokerTable";
import { JoinGate } from "@/components/room/JoinGate";
import { fetchRoom, leaveRoom, sendHost, sendMedia } from "@/lib/client/api";
import { clearRoomToken } from "@/lib/client/session";
import { useRoomSync } from "@/lib/realtime/use-room";
import { useLocalMedia } from "@/lib/video/use-local-media";
import { usePeerMedia } from "@/lib/video/use-peer-media";
import { samePlayerId } from "@/lib/video/rtc-protocol";
import { WebrtcDebugPanel } from "@/components/video/WebrtcDebugPanel";
import { cn, formatChips } from "@/lib/utils";
import type { RoomSnapshot } from "@/types/room";

export function RoomExperience({ code }: { code: string }) {
  const router = useRouter();
  const [joined, setJoined] = useState(false);
  const { snapshot, setSnapshot, error } = useRoomSync(code, joined);
  const media = useLocalMedia();
  const [sheet, setSheet] = useState<null | "chat" | "players" | "menu" | "invite">(
    null,
  );
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [sidebar, setSidebar] = useState<"game" | "chat" | "players">("game");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [inviteChecked, setInviteChecked] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const peerIds = useMemo(
    () =>
      (snapshot?.players ?? [])
        .map((player) => player.id)
        .filter((id): id is string => Boolean(id) && !samePlayerId(id, snapshot?.you?.id)),
    [snapshot],
  );
  const peers = usePeerMedia(
    code,
    snapshot?.you?.id,
    peerIds,
    media.stream,
    joined,
    snapshot?.rtcMessages ?? [],
  );
  const remoteStreams = peers.remoteStreams;
  const [audioBlocked, setAudioBlocked] = useState(false);
  const cameraBooted = useRef(false);
  const cameraRetry = useRef(false);

  useEffect(() => {
    void fetch("/api/admin/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { admin?: boolean }) => setIsAdmin(Boolean(data.admin)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!joined) return;
    if (!media.stream) {
      if (cameraBooted.current) return;
      cameraBooted.current = true;
      void media.start(true, true);
      return;
    }
    if (
      !cameraRetry.current &&
      !media.stream.getVideoTracks().some((track) => track.readyState === "live")
    ) {
      cameraRetry.current = true;
      void media.start(true, true);
    }
  }, [joined, media.stream, media.start]);

  useEffect(() => {
    if (!joined || !media.stream) return;
    void sendMedia(code, {
      cameraEnabled: media.cameraEnabled,
      microphoneEnabled: media.microphoneEnabled,
    });
  }, [code, joined, media.cameraEnabled, media.microphoneEnabled, media.stream]);

  useEffect(() => {
    let cancel = false;
    fetchRoom(code)
      .then((data) => {
        if (cancel) return;
        if (data.preview?.name) setRoomName(data.preview.name);
        if (data.snapshot?.you) {
          setSnapshot(data.snapshot);
          setJoined(true);
        }
        setInviteChecked(true);
      })
      .catch((err) => {
        if (cancel) return;
        setAccessError(err instanceof Error ? err.message : "This invitation is not valid.");
      });
    return () => {
      cancel = true;
    };
  }, [code, setSnapshot]);

  useEffect(() => {
    if (joined && snapshot && !snapshot.you && snapshot.status === "lobby") {
      setJoined(false);
    }
  }, [joined, snapshot]);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/room/${code}`;
  }, [code]);

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied");
  }

  async function shareInvite() {
    if (navigator.share) {
      await navigator.share({
        title: "Poker Night",
        text: "Join our private play-money poker room",
        url: inviteUrl,
      });
      return;
    }
    await copyInvite();
  }

  async function confirmLeave() {
    try {
      await leaveRoom(code);
    } catch {
      /* still leave */
    }
    media.stop();
    clearRoomToken(code);
    router.push("/");
  }

  if (accessError) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-3xl">Invitation unavailable</h1>
          <p className="mt-2 text-white/60">{accessError}</p>
          <Button className="mt-6" onClick={() => router.push("/")}>
            Back home
          </Button>
        </div>
      </div>
    );
  }

  if (!inviteChecked && !joined) {
    return (
      <div className="grid min-h-dvh place-items-center text-white/60">Checking invitation...</div>
    );
  }

  if (!joined) {
    return (
      <JoinGate
        code={code}
        roomName={roomName}
        media={media}
        onJoined={(s) => {
          setSnapshot(s);
          setJoined(true);
        }}
      />
    );
  }

  if (error && !snapshot) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-3xl">Room not found</h1>
          <p className="mt-2 text-white/60">{error}</p>
          <Button className="mt-6" onClick={() => router.push("/")}>
            Back home
          </Button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="grid min-h-dvh place-items-center text-white/60">Connecting to table...</div>
    );
  }

  const you = snapshot.you;
  const complete = snapshot.status === "complete" || snapshot.game?.phase === "complete";

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#07080a]">
      <header className="safe-top flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-5">
        <div>
          <p className="font-display text-lg leading-none">Poker Night</p>
          <p className="text-xs text-white/50">
            Room {snapshot.roomCode} · {snapshot.players.length}/{snapshot.maxPlayers}
          </p>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <span className="text-xs text-emerald-400">● Connected</span>
          <Button size="sm" variant="outline" onClick={() => setSheet("invite")}>
            Invite
          </Button>
          <Button size="sm" variant="danger" onClick={() => setLeaveOpen(true)}>
            Leave Table
          </Button>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-xl bg-white/5"
            onClick={() => setSheet("menu")}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>
      {(audioBlocked || media.error) && (
        <div className="shrink-0 border-b border-white/10 px-3 py-2 text-center text-sm">
          {audioBlocked && (
            <button
              type="button"
              className="rounded-full bg-gold px-4 py-1.5 font-semibold text-ink"
              onClick={() => setAudioBlocked(false)}
            >
              Tap to enable audio
            </button>
          )}
          {media.error && <p className="text-rose-300">{media.error}</p>}
        </div>
      )}

      {complete && snapshot.game ? (
        <GameComplete snapshot={snapshot} />
      ) : snapshot.status === "lobby" || !snapshot.game ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Lobby
            snapshot={snapshot}
            onUpdate={setSnapshot}
            localStream={media.stream}
            remoteStreams={remoteStreams}
            localId={you?.id}
            speakerMuted={media.speakerMuted}
            isAdmin={isAdmin}
            hostCode={code}
            onFrame={peers.markFrame}
            onAudioBlocked={setAudioBlocked}
          />
          <div className="relative z-40 flex shrink-0 justify-center gap-2 px-3 py-2">
            <IconToggle
              on={media.cameraEnabled}
              onClick={async () => {
                const next = await media.toggleCamera();
                void sendMedia(code, { cameraEnabled: next });
              }}
              iconOn={<Camera className="h-4 w-4" />}
              iconOff={<CameraOff className="h-4 w-4" />}
              label="Camera"
            />
            <IconToggle
              on={media.microphoneEnabled}
              onClick={async () => {
                const next = await media.toggleMic();
                void sendMedia(code, { microphoneEnabled: next });
              }}
              iconOn={<Mic className="h-4 w-4" />}
              iconOff={<MicOff className="h-4 w-4" />}
              label="Mic"
            />
            <IconToggle
              on={!media.speakerMuted}
              onClick={() => media.setSpeakerMuted(!media.speakerMuted)}
              iconOn={<Volume2 className="h-4 w-4" />}
              iconOff={<VolumeX className="h-4 w-4" />}
              label="Speaker"
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <p className="shrink-0 truncate px-3 pt-1 text-center text-xs text-gold/80 sm:text-sm">
              {snapshot.game?.paused || snapshot.status === "paused"
                ? "Game paused"
                : snapshot.game?.lastAction}
            </p>
            <PokerTable
              snapshot={snapshot}
              localStream={media.stream}
              remoteStreams={remoteStreams}
              speakerMuted={media.speakerMuted}
              onFrame={peers.markFrame}
              onAudioBlocked={setAudioBlocked}
            />
            <div className="relative z-40 flex shrink-0 justify-center gap-2 px-3 py-1">
              <IconToggle
                on={media.cameraEnabled}
                onClick={async () => {
                  const next = await media.toggleCamera();
                  void sendMedia(code, { cameraEnabled: next });
                }}
                iconOn={<Camera className="h-4 w-4" />}
                iconOff={<CameraOff className="h-4 w-4" />}
                label="Camera"
              />
              <IconToggle
                on={media.microphoneEnabled}
                onClick={async () => {
                  const next = await media.toggleMic();
                  void sendMedia(code, { microphoneEnabled: next });
                }}
                iconOn={<Mic className="h-4 w-4" />}
                iconOff={<MicOff className="h-4 w-4" />}
                label="Mic"
              />
              <IconToggle
                on={!media.speakerMuted}
                onClick={() => media.setSpeakerMuted(!media.speakerMuted)}
                iconOn={<Volume2 className="h-4 w-4" />}
                iconOff={<VolumeX className="h-4 w-4" />}
                label="Speaker"
              />
              <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => setSheet("chat")}>
                Chat
              </Button>
              <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => setSheet("players")}>
                <Users className="h-4 w-4" /> Players
              </Button>
            </div>
            <BettingControls snapshot={snapshot} onUpdate={setSnapshot} roomCode={code} />
          </div>
          <aside className="hidden w-[320px] shrink-0 border-l border-white/10 lg:flex lg:flex-col">
            <div className="flex border-b border-white/10">
              {(["game", "chat", "players"] as const).map((tab) => (
                <button
                  key={tab}
                  className={cn(
                    "min-h-11 flex-1 text-xs uppercase tracking-wider",
                    sidebar === tab ? "border-b-2 border-gold text-gold" : "text-white/40",
                  )}
                  onClick={() => setSidebar(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            {sidebar === "chat" && (
              <ChatPanel snapshot={snapshot} onUpdate={setSnapshot} embedded />
            )}
            {sidebar === "players" && (
              <PlayersList snapshot={snapshot} isHost={isAdmin} onUpdate={setSnapshot} />
            )}
            {sidebar === "game" && <GameInfo snapshot={snapshot} />}
          </aside>
        </div>
      )}

      {process.env.NODE_ENV !== "production" && <DevPanel snapshot={snapshot} />}

      {sheet === "chat" && (
        <Sheet onClose={() => setSheet(null)}>
          <ChatPanel snapshot={snapshot} onUpdate={setSnapshot} onClose={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "players" && (
        <Sheet onClose={() => setSheet(null)}>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="font-display">Players</p>
            <button className="grid h-11 w-11 place-items-center" onClick={() => setSheet(null)}>
              <X />
            </button>
          </div>
          <PlayersList snapshot={snapshot} isHost={isAdmin} onUpdate={setSnapshot} />
        </Sheet>
      )}
      {sheet === "invite" && (
        <Overlay onClose={() => setSheet(null)}>
          <h2 className="font-display text-2xl">Invite your friends</h2>
          <p className="mt-1 text-sm text-white/50">Share this private play-money table.</p>
          <p className="mt-4 break-all rounded-xl bg-black/40 p-3 text-sm">{inviteUrl}</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={copyInvite}>
              <Copy className="h-4 w-4" /> Copy Invite Link
            </Button>
            <Button variant="outline" onClick={shareInvite}>
              <Share2 className="h-4 w-4" /> Share
            </Button>
          </div>
        </Overlay>
      )}
      {sheet === "menu" && (
        <Sheet onClose={() => setSheet(null)}>
          <div className="space-y-2 p-4">
            <Button className="w-full" variant="ghost" onClick={() => setSheet("invite")}>
              Invite / Share
            </Button>
            <Button className="w-full" variant="ghost" onClick={() => setSheet("chat")}>
              Chat
            </Button>
            <Button className="w-full" variant="ghost" onClick={() => setSheet("players")}>
              Players
            </Button>
            <Button className="w-full" variant="danger" onClick={() => setLeaveOpen(true)}>
              <LogOut className="h-4 w-4" /> Leave Room
            </Button>
          </div>
        </Sheet>
      )}
      {leaveOpen && (
        <Overlay onClose={() => setLeaveOpen(false)}>
          <h2 className="font-display text-2xl">Are you sure you want to leave?</h2>
          <p className="mt-2 text-sm text-white/60">
            Your seat will be vacated if the game has not started.
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="danger" onClick={confirmLeave}>
              Leave Table
            </Button>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
              Stay
            </Button>
          </div>
        </Overlay>
      )}
      <WebrtcDebugPanel
        diagnostics={peers.diagnostics}
        localAudio={media.microphoneEnabled}
        localVideo={media.cameraEnabled}
        turnConfigured={peers.turnConfigured}
        turnWarning={peers.turnWarning}
        iceFetchStatus={peers.iceFetchStatus}
        forceRelay={peers.forceRelay}
        onForceRelay={peers.setForceRelay}
        onTestCamera={() => {
          void media.start(true, media.microphoneEnabled);
        }}
        onTestMic={() => {
          void media.start(media.cameraEnabled, true);
        }}
        onReconnect={peers.reconnect}
        onRestartIce={peers.restartIce}
      />
    </div>
  );
}

function IconToggle({
  on,
  onClick,
  iconOn,
  iconOff,
  label,
}: {
  on: boolean;
  onClick: () => void;
  iconOn: ReactNode;
  iconOff: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-full border",
        on ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/10 bg-white/5",
      )}
    >
      {on ? iconOn : iconOff}
    </button>
  );
}

function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}>
      <div
        className="safe-bottom absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-[#120c10]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-0 sm:place-items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-lg rounded-t-3xl p-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function PlayersList({
  snapshot,
  isHost,
  onUpdate,
}: {
  snapshot: RoomSnapshot;
  isHost: boolean;
  onUpdate: (s: RoomSnapshot) => void;
}) {
  return (
    <div className="space-y-2 overflow-y-auto p-4">
      {snapshot.players.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
          <div>
            <p className="text-sm font-medium">
              {p.displayName} {p.id === snapshot.you?.id ? "· You" : ""}
            </p>
            <p className="text-xs text-white/50">
              🪙 {formatChips(p.chipBalance)} · {p.isConnected ? "Online" : "Away"} ·{" "}
              {p.cameraEnabled ? "Cam on" : "Cam off"}
            </p>
          </div>
          {isHost && !p.isHost && snapshot.status === "lobby" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const data = await sendHost(snapshot.roomCode, { command: "kick", playerId: p.id });
                if (data.snapshot) onUpdate(data.snapshot);
              }}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function GameInfo({ snapshot }: { snapshot: RoomSnapshot }) {
  return (
    <div className="space-y-3 p-4 text-sm">
      <Row label="Blinds" value={`${snapshot.smallBlind} / ${snapshot.bigBlind}`} />
      <Row label="Pot" value={formatChips(snapshot.game?.pot ?? 0)} />
      <Row label="Hand" value={`#${snapshot.game?.handNumber ?? 0}`} />
      <Row
        label="Phase"
        value={
          snapshot.game?.paused || snapshot.status === "paused"
            ? "paused"
            : snapshot.game?.phase ?? "lobby"
        }
      />
      <Row label="Starting chips" value={formatChips(snapshot.startingChips)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-white/5 py-2">
      <span className="text-white/45">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function GameComplete({ snapshot }: { snapshot: RoomSnapshot }) {
  const ranked = [...snapshot.players].sort((a, b) => b.chipBalance - a.chipBalance);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col justify-center overflow-hidden px-4 py-4 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-gold">Game complete</p>
      <h1 className="font-display mt-1 text-3xl sm:text-4xl">Leaderboard</h1>
      <ol className="mt-4 space-y-2 text-left">
        {ranked.map((p, i) => (
          <li key={p.id} className="glass-card flex items-center justify-between rounded-2xl px-4 py-3">
            <span>
              {i + 1}. {p.displayName}
            </span>
            <span className="text-gold-bright">🪙 {formatChips(p.chipBalance)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm text-white/55">
        The match is over. Use Back to lobby to wait for the next game.
      </p>
    </div>
  );
}

function DevPanel({ snapshot }: { snapshot: RoomSnapshot }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <details className="fixed bottom-24 right-3 z-40 hidden max-w-sm rounded-xl bg-black/80 p-3 text-[11px] text-emerald-200 lg:block">
      <summary className="cursor-pointer text-gold">Debug</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">
        {JSON.stringify(
          {
            room: snapshot.roomCode,
            phase: snapshot.game?.phase,
            dealer: snapshot.game?.dealerSeat,
            current: snapshot.game?.currentSeat,
            pot: snapshot.game?.pot,
            deckRemaining: snapshot.game?.deckRemaining,
            players: snapshot.players.map((p) => p.displayName),
          },
          null,
          2,
        )}
      </pre>
    </details>
  );
}
