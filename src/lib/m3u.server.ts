import type { M3uChannel } from "./xtream-types";

export type { M3uChannel };

export type M3uImport =
  | { type: "xtream"; server: string; username: string; password: string }
  | { type: "m3u"; name: string; channels: M3uChannel[] };

const MAX_CHANNELS = 20000;

function attr(line: string, key: string): string | null {
  const m = line.match(new RegExp(`${key}="([^"]*)"`, "i"));
  return m?.[1]?.trim() || null;
}

/** Detect an Xtream `get.php` playlist link and pull out the credentials. */
export function xtreamFromM3uUrl(raw: string): M3uImport | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const username = url.searchParams.get("username");
  const password = url.searchParams.get("password");
  if (!username || !password) return null;
  if (!/get\.php|player_api\.php/i.test(url.pathname)) return null;
  return { type: "xtream", server: `${url.protocol}//${url.host}`, username, password };
}

export function parseM3u(text: string): M3uChannel[] {
  const lines = text.split(/\r?\n/);
  const channels: M3uChannel[] = [];
  let pending: Omit<M3uChannel, "url" | "id"> | null = null;
  let index = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.toUpperCase().startsWith("#EXTINF")) {
      const name = line.slice(line.indexOf(",") + 1).trim() || attr(line, "tvg-name") || "Unnamed";
      pending = {
        name,
        icon: attr(line, "tvg-logo"),
        group: attr(line, "group-title") || "Ungrouped",
        epgChannelId: attr(line, "tvg-id"),
      };
      continue;
    }
    if (line.startsWith("#")) continue;
    if (!pending) continue;
    if (!/^https?:\/\//i.test(line)) {
      pending = null;
      continue;
    }
    channels.push({ ...pending, id: `m3u-${index}`, url: line });
    index += 1;
    pending = null;
    if (channels.length >= MAX_CHANNELS) break;
  }

  return channels;
}

export async function fetchM3u(source: string): Promise<string> {
  const url = /^https?:\/\//i.test(source.trim()) ? source.trim() : `http://${source.trim()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error("Could not reach the playlist URL.");
  }
  if (!res.ok) throw new Error(`The playlist server responded with ${res.status}.`);
  const text = await res.text();
  if (!/#EXTM3U|#EXTINF/i.test(text)) throw new Error("That URL did not return an M3U playlist.");
  return text;
}
