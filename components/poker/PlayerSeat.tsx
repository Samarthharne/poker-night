"use client";

import { Mic, MicOff, Video, VideoOff, Wifi, WifiOff } from "lucide-react";
import { cn, formatChips, initials } from "@/lib/utils";
import type { PublicPlayer } from "@/types/player";
import { PlayingCard } from "./PlayingCard";
import { VideoPlayer } from "@/components/video/VideoPlayer";

export function PlayerSeat({
  player,
  dealerSeat,
  smallBlindSeat,
  bigBlindSeat,
  isTurn,
  compact,
  fitted,
  localStream,
  remoteStream,
  showCards,
  isYou,
  speakerMuted,
  onExpand,
  onFrame,
  onAudioBlocked,
}: {
  player: PublicPlayer;
  dealerSeat: number | null;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  isTurn: boolean;
  compact?: boolean;
  fitted?: boolean;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  showCards?: boolean;
  isYou?: boolean;
  speakerMuted?: boolean;
  onExpand?: () => void;
  onFrame?: (ready: boolean) => void;
  onAudioBlocked?: (blocked: boolean) => void;
}) {
  const reconnecting = !player.isConnected;
  const remote =
    remoteStream && localStream && remoteStream.id === localStream.id ? null : remoteStream;
  const stream = isYou ? localStream ?? null : remote ?? null;
  const hasMedia = Boolean(stream?.getTracks().some((track) => track.readyState !== "ended"));
  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.readyState !== "ended"));

  return (
    <div
      role={onExpand ? "button" : undefined}
      tabIndex={onExpand ? 0 : undefined}
      onClick={onExpand}
      className={cn(
        "relative cursor-pointer text-left glass-card shadow-xl transition",
        fitted
          ? "w-[112px] rounded-2xl sm:w-[140px] lg:w-[164px]"
          : compact
            ? "w-[108px] rounded-2xl"
            : "w-[148px] rounded-3xl sm:w-[168px]",
        isTurn && "ring-2 ring-gold shadow-[0_0_24px_rgba(212,177,90,0.35)]",
        player.folded && "opacity-55",
        isYou && "outline outline-1 outline-gold/50",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden bg-[#120c10]",
          fitted ? "h-14 rounded-t-2xl sm:h-[4.5rem] lg:h-20" : compact ? "h-[72px] rounded-t-2xl" : "h-[96px] rounded-t-3xl sm:h-[112px]",
        )}
      >
        <VideoPlayer
          stream={stream ?? null}
          enabled={Boolean(stream)}
          muted={Boolean(isYou) || Boolean(speakerMuted)}
          mirror={Boolean(isYou)}
          label={player.displayName}
          fallback={
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#120c10]">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-burgundy text-lg font-semibold">
                {hasMedia && !isYou && !hasVideo ? "…" : initials(player.displayName)}
              </div>
            </div>
          }
          onFrame={onFrame}
          onAudioBlocked={onAudioBlocked}
        />
        {reconnecting && (
          <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-center text-[10px] uppercase tracking-wider text-amber-200">
            {player.displayName} reconnecting...
          </div>
        )}
        <div className="absolute left-1.5 top-1.5 flex gap-1">
          {player.microphoneEnabled ? (
            <Mic className="h-3.5 w-3.5 text-emerald-300" />
          ) : (
            <MicOff className="h-3.5 w-3.5 text-white/50" />
          )}
          {player.cameraEnabled ? (
            <Video className="h-3.5 w-3.5 text-emerald-300" />
          ) : (
            <VideoOff className="h-3.5 w-3.5 text-white/50" />
          )}
          {player.isConnected ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-300" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-amber-300" />
          )}
        </div>
      </div>
      <div className={cn("px-2 py-1.5", compact && "py-1")}>
        <div className="flex items-center justify-between gap-1">
          <p className="truncate text-xs font-semibold sm:text-sm">{player.displayName}</p>
          {isYou && <span className="text-[10px] uppercase text-gold">You</span>}
        </div>
        <p className="text-sm font-semibold text-gold-bright">🪙 {formatChips(player.chipBalance)}</p>
        {player.currentBet > 0 && (
          <p className="text-[11px] text-white/70">Bet {formatChips(player.currentBet)}</p>
        )}
        {player.folded && <p className="text-[11px] uppercase text-rose-300">Folded</p>}
        {player.allIn && !player.folded && (
          <p className="text-[11px] uppercase text-amber-300">All-in</p>
        )}
      </div>
      {showCards && player.holeCards && (
        <div className="flex justify-center gap-1 px-1.5 pb-1.5">
          <PlayingCard card={player.holeCards[0]} size="sm" />
          <PlayingCard card={player.holeCards[1]} size="sm" delay={0.08} />
        </div>
      )}
      {showCards && player.hasCards && !player.holeCards && (
        <div className="flex justify-center gap-1 px-1.5 pb-1.5">
          <PlayingCard hidden size="sm" />
          <PlayingCard hidden size="sm" delay={0.08} />
        </div>
      )}
      <div className="absolute -right-1 -top-1 z-20 flex gap-1">
        {dealerSeat === player.seatNumber && (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[10px] font-bold text-ink">
            D
          </span>
        )}
        {smallBlindSeat === player.seatNumber && (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-sky-400 text-[10px] font-bold text-ink">
            SB
          </span>
        )}
        {bigBlindSeat === player.seatNumber && (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-ink">
            BB
          </span>
        )}
      </div>
    </div>
  );
}
