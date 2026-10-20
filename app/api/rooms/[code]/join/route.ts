import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { joinBlockReason } from "@/lib/admin/invitations";
import { clientKey, rateLimit } from "@/lib/admin/rate-limit";
import { getTokenFromRequest } from "@/lib/session";
import {
  findPlayerBySession,
  findPlayerByToken,
  ensureStore,
  getRoomByInviteToken,
  heartbeat,
  saveRoom,
  snapshotFor,
} from "@/lib/store/rooms";

const sessionNano = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 24);
const tokenNano = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 32);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  if (!rateLimit(clientKey(req, "invite-join"), 10, 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }
  const { code } = await ctx.params;
  await ensureStore(req);
  const room = getRoomByInviteToken(code);
  if (!room) {
    return NextResponse.json({ error: "This invitation is not valid." }, { status: 404 });
  }

  const body = (await req.json()) as {
    displayName?: string;
    sessionId?: string;
    cameraEnabled?: boolean;
    microphoneEnabled?: boolean;
  };

  const existingToken = getTokenFromRequest(req);
  const byToken = findPlayerByToken(room, existingToken);
  const sessionId = body.sessionId || sessionNano();
  const bySession = findPlayerBySession(room, sessionId);
  const returning = byToken ?? bySession;

  if (returning && !returning.removed) {
    returning.sessionId = sessionId;
    returning.isConnected = true;
    returning.lastSeenAt = Date.now();
    if (body.displayName?.trim() && room.status === "lobby") {
      returning.displayName = body.displayName.trim().slice(0, 24);
    }
    if (typeof body.cameraEnabled === "boolean") {
      returning.cameraEnabled = body.cameraEnabled;
    }
    if (typeof body.microphoneEnabled === "boolean") {
      returning.microphoneEnabled = body.microphoneEnabled;
    }
    heartbeat(room, returning);
    saveRoom(room);
    return seatCookie(
      NextResponse.json({
        token: returning.token,
        sessionId: returning.sessionId,
        snapshot: snapshotFor(room, returning.token),
      }),
      returning.token,
    );
  }

  const block = joinBlockReason(room, code);
  if (block) {
    return NextResponse.json({ error: block }, { status: 403 });
  }

  const displayName = (body.displayName ?? "").trim().slice(0, 24);
  if (displayName.length < 2) {
    return NextResponse.json({ error: "Enter a display name." }, { status: 400 });
  }

  const taken = new Set(room.players.map((p) => p.seatNumber));
  let seat = 1;
  while (taken.has(seat) && seat <= room.maxPlayers) seat += 1;

  const player = {
    id: crypto.randomUUID(),
    token: tokenNano(),
    sessionId,
    displayName,
    seatNumber: seat,
    chipBalance: room.startingChips,
    currentBet: 0,
    totalBetThisHand: 0,
    isHost: false,
    removed: false,
    isConnected: true,
    lastSeenAt: Date.now(),
    cameraEnabled: Boolean(body.cameraEnabled),
    microphoneEnabled: Boolean(body.microphoneEnabled),
    folded: false,
    allIn: false,
    hasActedThisRound: false,
    isReady: true,
    contributedThisHand: 0,
  };
  room.players.push(player);
  saveRoom(room);

  return seatCookie(
    NextResponse.json({
      token: player.token,
      sessionId,
      snapshot: snapshotFor(room, player.token),
    }),
    player.token,
  );
}

function seatCookie(res: NextResponse, token: string) {
  res.cookies.set("poker_seat", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
