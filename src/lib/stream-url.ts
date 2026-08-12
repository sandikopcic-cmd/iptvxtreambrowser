import { useEffect, useState } from "react";
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

const DIRECT_KEY = "xtream.directPlay";

export function isDirectPlay(): boolean {
  if (typeof window === "undefined") return false;
  // Direct is the default: the device talks straight to the IPTV provider,
  // which is what the provider expects. Proxy is only an opt-in fallback.
  return window.localStorage.getItem(DIRECT_KEY) !== "0";
}

export function setDirectPlay(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DIRECT_KEY, value ? "1" : "0");
  window.dispatchEvent(new Event("xtream-direct-play"));
}

/** Always routes through this site's relay, regardless of Direct mode. */
export function toProxyUrl(absoluteUrl: string): string {
  if (!/^https?:\/\//i.test(absoluteUrl)) return absoluteUrl;
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

export function proxied(absoluteUrl: string): string {
  // Direct mode: the device connects straight to the IPTV provider, so the
  // provider sees your own IP instead of the hosting IP (fixes HTTP 458).
  if (isDirectPlay()) return absoluteUrl;
  return toProxyUrl(absoluteUrl);
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

export function useDirectPlay(): [boolean, (value: boolean) => void] {
  const [direct, setDirect] = useState(false);

  useEffect(() => {
    const read = () => setDirect(isDirectPlay());
    read();
    window.addEventListener("xtream-direct-play", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("xtream-direct-play", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return [direct, setDirectPlay];
}
