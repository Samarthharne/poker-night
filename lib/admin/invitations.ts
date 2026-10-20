import { hashInviteToken, newInviteToken, openInviteToken, sealInviteToken } from "@/lib/admin/crypto";
import { getRoomByInviteToken, rememberInvite, saveRoom } from "@/lib/store/rooms";
import type { Room } from "@/types/room";

export function issueInvitation(room: Room, expiresAt: number | null) {
  const token = newInviteToken();
  const hash = hashInviteToken(token);
  if (room.inviteHash && room.inviteHash !== hash) {
    rememberInvite(room, room.inviteHash);
  }
  room.inviteHash = hash;
  room.inviteSealed = sealInviteToken(token);
  room.inviteExpiresAt = expiresAt;
  rememberInvite(room, hash);
  saveRoom(room);
  return token;
}

export function currentInviteToken(room: Room) {
  if (!room.inviteSealed || !room.inviteHash) return null;
  return openInviteToken(room.inviteSealed);
}

export function joinBlockReason(room: Room, token: string) {
  const hash = hashInviteToken(token);
  const known = getRoomByInviteToken(token);
  if (!known || known.id !== room.id) return "This invitation is not valid.";
  if (hash !== room.inviteHash) return "This invitation has been revoked.";
  if (room.inviteExpiresAt && room.inviteExpiresAt < Date.now()) {
    return "This invitation has expired.";
  }
  if (room.closedAt || room.status === "closed") return "This room is closed.";
  if (room.expiresAt && room.expiresAt < Date.now()) return "This room has expired.";
  if (room.locked) return "This room is locked.";
  const seated = room.players.filter((p) => !p.removed).length;
  if (seated >= room.maxPlayers) return "This table is full.";
  return null;
}

export function activePlayers(room: Room) {
  return room.players.filter((p) => !p.removed && p.isConnected).length;
}
