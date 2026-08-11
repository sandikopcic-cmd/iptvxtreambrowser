import type { XtreamCreds } from "./xtream-types";

export function normalizeServerUrl(server: string): string {
  let s = server.trim();
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s.replace(/\/+$/, "").replace(/\/(player_api\.php|c|get\.php).*$/i, "");
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function proxied(absoluteUrl: string): string {
  let format = "";
  try {
    const pathname = new URL(absoluteUrl).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    format = match?.[1]?.toLowerCase() ?? "";
  } catch {
    format = "";
  }

  const formatParam = format ? `&format=${encodeURIComponent(format)}` : "";
  return `/api/public/stream?u=${toBase64Url(absoluteUrl)}${formatParam}`;
}

export function liveStreamUrl(creds: XtreamCreds, streamId: string, hls = true): string {
  const base = normalizeServerUrl(creds.server);
  const ext = hls ? "m3u8" : "ts";
  return proxied(
    `${base}/live/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${ext}`,
  );
}

export function movieStreamUrl(creds: XtreamCreds, streamId: string, ext: string): string {
  const base = normalizeServerUrl(creds.server);
  return proxied(
    `${base}/movie/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${ext || "mp4"}`,
  );
}

export function episodeStreamUrl(creds: XtreamCreds, episodeId: string, ext: string): string {
  const base = normalizeServerUrl(creds.server);
  return proxied(
    `${base}/series/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${episodeId}.${ext || "mp4"}`,
  );
}
