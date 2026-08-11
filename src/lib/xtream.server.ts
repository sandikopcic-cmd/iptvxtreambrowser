import type {
  Category,
  EpgEntry,
  Episode,
  LiveChannel,
  SeriesDetail,
  SeriesItem,
  VodDetail,
  VodItem,
  XtreamAccount,
  XtreamCreds,
} from "./xtream-types";

export function normalizeServer(server: string): string {
  let s = server.trim();
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s.replace(/\/+$/, "").replace(/\/(player_api\.php|c|get\.php).*$/i, "");
}

export async function xtreamApi(
  creds: XtreamCreds,
  params: Record<string, string> = {},
): Promise<unknown> {
  const base = normalizeServer(creds.server);
  const qs = new URLSearchParams({
    username: creds.username,
    password: creds.password,
    ...params,
  });
  const url = `${base}/player_api.php?${qs.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Accept: "*/*" },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("Could not reach the IPTV server. Check the server address.");
  }

  if (!res.ok) throw new Error(`IPTV server responded with ${res.status}`);

  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The IPTV server returned an unexpected response.");
  }
}

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

type Rec = Record<string, unknown>;
const asArray = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : []);
const asRec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});

export function parseAccount(raw: unknown): XtreamAccount {
  const info = asRec(asRec(raw)["user_info"]);
  if (!info["username"]) throw new Error("Invalid credentials or server address.");
  if (String(info["auth"] ?? "1") === "0") throw new Error("Invalid username or password.");
  const exp = str(info["exp_date"]);
  return {
    username: String(info["username"]),
    status: String(info["status"] ?? "Unknown"),
    expDate: exp ? new Date(Number(exp) * 1000).toISOString() : null,
    isTrial: String(info["is_trial"] ?? "0") === "1",
    activeConnections: String(info["active_cons"] ?? "0"),
    maxConnections: String(info["max_connections"] ?? "0"),
  };
}

export function parseCategories(raw: unknown): Category[] {
  return asArray(raw).map((c) => ({
    id: String(c["category_id"]),
    name: String(c["category_name"] ?? "Unnamed"),
  }));
}

export function parseLive(raw: unknown): LiveChannel[] {
  return asArray(raw).map((c) => ({
    id: String(c["stream_id"]),
    name: String(c["name"] ?? "Unnamed"),
    icon: str(c["stream_icon"]),
    categoryId: str(c["category_id"]),
    epgChannelId: str(c["epg_channel_id"]),
    num: Number(c["num"] ?? 0),
  }));
}

export function parseVod(raw: unknown): VodItem[] {
  return asArray(raw).map((c) => ({
    id: String(c["stream_id"]),
    name: String(c["name"] ?? "Unnamed"),
    icon: str(c["stream_icon"]) ?? str(c["cover"]),
    categoryId: str(c["category_id"]),
    rating: str(c["rating"]),
    added: str(c["added"]),
    ext: str(c["container_extension"]),
  }));
}

export function parseSeriesList(raw: unknown): SeriesItem[] {
  return asArray(raw).map((c) => ({
    id: String(c["series_id"]),
    name: String(c["name"] ?? "Unnamed"),
    icon: str(c["cover"]),
    categoryId: str(c["category_id"]),
    rating: str(c["rating"]),
    plot: str(c["plot"]),
  }));
}

export function parseVodDetail(raw: unknown): VodDetail {
  const root = asRec(raw);
  const info = asRec(root["info"]);
  const data = asRec(root["movie_data"]);
  return {
    name: String(data["name"] ?? info["name"] ?? "Untitled"),
    plot: str(info["plot"]) ?? str(info["description"]),
    cast: str(info["cast"]),
    director: str(info["director"]),
    genre: str(info["genre"]),
    releaseDate: str(info["releasedate"]) ?? str(info["release_date"]),
    rating: str(info["rating"]),
    duration: str(info["duration"]),
    cover: str(info["movie_image"]) ?? str(info["cover_big"]),
    ext: String(data["container_extension"] ?? "mp4"),
  };
}

export function parseSeriesDetail(raw: unknown): SeriesDetail {
  const root = asRec(raw);
  const info = asRec(root["info"]);
  const episodesRaw = asRec(root["episodes"]);
  const seasons = Object.keys(episodesRaw)
    .map((key) => {
      const episodes: Episode[] = asArray(episodesRaw[key]).map((e) => {
        const ei = asRec(e["info"]);
        return {
          id: String(e["id"]),
          title: String(e["title"] ?? `Episode ${e["episode_num"]}`),
          episodeNum: Number(e["episode_num"] ?? 0),
          season: Number(e["season"] ?? key),
          ext: String(e["container_extension"] ?? "mp4"),
          plot: str(ei["plot"]),
          image: str(ei["movie_image"]),
          duration: str(ei["duration"]),
        };
      });
      episodes.sort((a, b) => a.episodeNum - b.episodeNum);
      return { season: Number(key), episodes };
    })
    .sort((a, b) => a.season - b.season);

  return {
    name: String(info["name"] ?? "Untitled"),
    plot: str(info["plot"]),
    cast: str(info["cast"]),
    genre: str(info["genre"]),
    releaseDate: str(info["releaseDate"]) ?? str(info["releasedate"]),
    rating: str(info["rating"]),
    cover: str(info["cover"]),
    seasons,
  };
}

function decodeB64(value: string): string {
  try {
    return typeof atob === "function"
      ? decodeURIComponent(escape(atob(value)))
      : Buffer.from(value, "base64").toString("utf-8");
  } catch {
    return value;
  }
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseEpg(raw: unknown): EpgEntry[] {
  return asArray(asRec(raw)["epg_listings"]).map((e) => ({
    title: decodeB64(String(e["title"] ?? "")),
    description: decodeB64(String(e["description"] ?? "")),
    start: String(e["start"] ?? ""),
    end: String(e["end"] ?? e["stop"] ?? ""),
    startTs: num(e["start_timestamp"]),
    endTs: num(e["stop_timestamp"] ?? e["end_timestamp"]),
  }));
}
