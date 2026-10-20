const SESSION_KEY = "poker-night-session";

export function getSessionId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function tokenKey(code: string) {
  return `poker-night-token:${code}`;
}

export function getRoomToken(code: string) {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(tokenKey(code)) ?? "";
}

export function setRoomToken(code: string, token: string) {
  localStorage.setItem(tokenKey(code), token);
}

export function clearRoomToken(code: string) {
  localStorage.removeItem(tokenKey(code));
}
