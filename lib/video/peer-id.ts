export function peerName(code: string, playerId: string) {
  const room = code.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase();
  return `p${room}${playerId.replace(/-/g, "").toLowerCase()}`;
}

export function hydratePlayerId(value: string) {
  const raw = value.replace(/-/g, "").toLowerCase().replace(/[^a-f0-9]/g, "");
  const id = raw.slice(-32);
  if (/^[0-9a-f]{32}$/.test(id)) {
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  }
  return value;
}

export function playerIdFromPeer(name: string, peerIds: string[]) {
  const normalized = name.replace(/-/g, "").toLowerCase();
  const hit = peerIds.find((id) => normalized.endsWith(id.replace(/-/g, "").toLowerCase()));
  if (hit) return hit;
  return hydratePlayerId(name);
}
