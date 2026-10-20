export function publicOrigin(req: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}
