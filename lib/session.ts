export function getTokenFromRequest(req: Request) {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  try {
    const queryToken = new URL(req.url).searchParams.get("token");
    if (queryToken) return queryToken;
  } catch {
    /* ignore malformed urls */
  }
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|; )poker_seat=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return null;
}
