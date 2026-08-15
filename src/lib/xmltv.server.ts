import type { EpgEntry } from "./xtream-types";

const CACHE_TTL = 15 * 60 * 1000;
const MAX_BYTES = 60 * 1024 * 1024;
const cache = new Map<string, { at: number; text: string }>();

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .trim();
}

/** Parse an XMLTV timestamp like `20260815060000 +0200` into epoch ms. */
export function xmltvTime(raw: string): number | null {
  const m = raw
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, sign, oh, om] = m;
  const base = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, s ? +s : 0);
  if (!sign) return base;
  const offset = (+oh! * 60 + +om!) * 60_000 * (sign === "-" ? -1 : 1);
  return base - offset;
}

async function readBody(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("The EPG file is too large to read.");
  // Handle .gz files that arrive without a content-encoding header.
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf as unknown as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }
  return new TextDecoder().decode(buf);
}

async function loadXmltv(source: string): Promise<string> {
  const url = /^https?:\/\//i.test(source.trim()) ? source.trim() : `http://${source.trim()}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.text;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new Error("Could not reach the EPG URL.");
  }
  if (!res.ok) throw new Error(`The EPG server responded with ${res.status}.`);
  const text = await readBody(res);
  if (!/<tv[\s>]|<programme/i.test(text)) throw new Error("That URL did not return XMLTV data.");
  cache.set(url, { at: Date.now(), text });
  return text;
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]!) : null;
}

/** Programmes for one XMLTV channel id, sorted by start time. */
export async function xmltvEpg(source: string, channelId: string): Promise<EpgEntry[]> {
  const text = await loadXmltv(source);
  const wanted = channelId.trim().toLowerCase();
  const entries: EpgEntry[] = [];

  const re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const attrs = m[1]!;
    const id = attrs.match(/channel="([^"]*)"/i)?.[1]?.trim().toLowerCase();
    if (id !== wanted) continue;
    const start = attrs.match(/start="([^"]*)"/i)?.[1] ?? "";
    const stop = attrs.match(/stop="([^"]*)"/i)?.[1] ?? "";
    entries.push({
      title: tag(m[2]!, "title") || "Untitled",
      description: tag(m[2]!, "desc") || "",
      start,
      end: stop,
      startTs: xmltvTime(start) ? Math.floor(xmltvTime(start)! / 1000) : null,
      endTs: xmltvTime(stop) ? Math.floor(xmltvTime(stop)! / 1000) : null,
    });
    if (entries.length > 200) break;
  }

  entries.sort((a, b) => (a.startTs ?? 0) - (b.startTs ?? 0));
  const now = Date.now() / 1000;
  const upcoming = entries.filter((e) => (e.endTs ?? 0) >= now);
  return (upcoming.length > 0 ? upcoming : entries).slice(0, 8);
}
