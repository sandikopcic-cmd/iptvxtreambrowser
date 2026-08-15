import { useCallback, useEffect, useState } from "react";
import type { M3uChannel, XtreamCreds } from "./xtream-types";

const LEGACY_KEY = "xtream.creds";
const PROFILES_KEY = "xtream.profiles";
const ACTIVE_KEY = "xtream.activeProfile";

export type XtreamProfile = XtreamCreds & {
  id: string;
  name: string;
  /** "xtream" (default) uses the Xtream API; "m3u" plays a stored M3U channel list. */
  kind?: "xtream" | "m3u";
  /** Optional external XMLTV guide URL used instead of the provider EPG. */
  epgUrl?: string;
};

type State = { profiles: XtreamProfile[]; activeId: string | null };

let cache: State | null = null;
const listeners = new Set<(s: State) => void>();

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function readState(): State {
  if (typeof window === "undefined") return { profiles: [], activeId: null };
  let profiles: XtreamProfile[] = [];
  try {
    const raw = window.localStorage.getItem(PROFILES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) {
      profiles = parsed.filter(
        (p): p is XtreamProfile =>
          !!p &&
          typeof p === "object" &&
          typeof (p as XtreamProfile).server === "string" &&
          typeof (p as XtreamProfile).username === "string" &&
          typeof (p as XtreamProfile).password === "string",
      );
    }
  } catch {
    profiles = [];
  }

  // Migrate a single legacy credential set into the profile list.
  if (profiles.length === 0) {
    try {
      const raw = window.localStorage.getItem(LEGACY_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<XtreamCreds>;
        if (p.server && p.username && p.password) {
          profiles = [
            {
              id: newId(),
              name: p.username,
              server: p.server,
              username: p.username,
              password: p.password,
            },
          ];
          window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
        }
      }
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
  }

  const activeId = window.localStorage.getItem(ACTIVE_KEY);
  return {
    profiles,
    activeId: profiles.some((p) => p.id === activeId) ? activeId : null,
  };
}

function persist(state: State) {
  window.localStorage.setItem(PROFILES_KEY, JSON.stringify(state.profiles));
  if (state.activeId) window.localStorage.setItem(ACTIVE_KEY, state.activeId);
  else window.localStorage.removeItem(ACTIVE_KEY);
  cache = state;
  listeners.forEach((l) => l(state));
}

function current(): State {
  if (!cache) cache = readState();
  return cache;
}

/** Add (or update, when server+username match) a playlist and make it active. */
export function saveCreds(creds: XtreamCreds, name?: string, epgUrl?: string): XtreamProfile {
  const state = current();
  const existing = state.profiles.find(
    (p) => p.server === creds.server && p.username === creds.username,
  );
  let profile: XtreamProfile;
  let profiles: XtreamProfile[];
  if (existing) {
    profile = {
      ...existing,
      ...creds,
      name: name?.trim() || existing.name,
      ...(epgUrl !== undefined ? { epgUrl: epgUrl.trim() } : {}),
    };
    profiles = state.profiles.map((p) => (p.id === existing.id ? profile : p));
  } else {
    profile = {
      id: newId(),
      name: name?.trim() || creds.username,
      ...creds,
      ...(epgUrl?.trim() ? { epgUrl: epgUrl.trim() } : {}),
    };
    profiles = [...state.profiles, profile];
  }
  persist({ profiles, activeId: profile.id });
  return profile;
}

const M3U_CHANNELS_PREFIX = "m3u.channels.";

/** Session fallback when the browser storage quota is too small for a playlist. */
const memoryChannels = new Map<string, M3uChannel[]>();

type CompactChannel = [string, string, string, string, string, string];

function encodeChannels(channels: M3uChannel[]): string {
  const rows: CompactChannel[] = channels.map((c) => [
    c.id,
    c.name,
    c.icon ?? "",
    c.group,
    c.epgChannelId ?? "",
    c.url,
  ]);
  return JSON.stringify({ v: 2, rows });
}

function decodeChannels(raw: string): M3uChannel[] {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) return parsed as M3uChannel[];
  const rows = (parsed as { rows?: CompactChannel[] } | null)?.rows;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id: r[0],
    name: r[1],
    icon: r[2] || null,
    group: r[3],
    epgChannelId: r[4] || null,
    url: r[5],
  }));
}

/** Try to persist channels; drops other cached playlists before giving up. */
function persistChannels(id: string, channels: M3uChannel[]): boolean {
  const key = M3U_CHANNELS_PREFIX + id;
  const payload = encodeChannels(channels);
  const attempt = () => {
    window.localStorage.setItem(key, payload);
    return true;
  };
  try {
    return attempt();
  } catch {
    // Free space taken by other playlists, then retry once.
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(M3U_CHANNELS_PREFIX) && k !== key) stale.push(k);
    }
    stale.forEach((k) => window.localStorage.removeItem(k));
    try {
      return attempt();
    } catch {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return false;
    }
  }
}

/** Save an imported M3U playlist (channels kept separately) and make it active. */
export function saveM3uPlaylist(
  name: string,
  sourceUrl: string,
  channels: M3uChannel[],
  epgUrl?: string,
): XtreamProfile {
  const state = current();
  const existing = state.profiles.find((p) => p.kind === "m3u" && p.server === sourceUrl);
  const id = existing?.id ?? newId();
  const profile: XtreamProfile = {
    id,
    kind: "m3u",
    name: name.trim() || existing?.name || "M3U playlist",
    server: sourceUrl,
    username: `m3u:${id}`,
    password: "",
    ...(epgUrl?.trim() ? { epgUrl: epgUrl.trim() } : {}),
  };
  memoryChannels.set(id, channels);
  persistChannels(id, channels);
  const profiles = existing
    ? state.profiles.map((p) => (p.id === id ? profile : p))
    : [...state.profiles, profile];
  persist({ profiles, activeId: id });
  return profile;
}

export function getM3uChannels(id: string): M3uChannel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(M3U_CHANNELS_PREFIX + id);
    if (raw) return decodeChannels(raw);
  } catch {
    /* fall through to the in-memory copy */
  }
  return memoryChannels.get(id) ?? [];
}


export function selectProfile(id: string) {
  const state = current();
  if (!state.profiles.some((p) => p.id === id)) return;
  persist({ ...state, activeId: id });
}

export function removeProfile(id: string) {
  const state = current();
  const profiles = state.profiles.filter((p) => p.id !== id);
  persist({ profiles, activeId: state.activeId === id ? null : state.activeId });
}

export function renameProfile(id: string, name: string) {
  const state = current();
  persist({
    ...state,
    profiles: state.profiles.map((p) => (p.id === id ? { ...p, name } : p)),
  });
}

/** Update a saved playlist (name and, for Xtream playlists, credentials). */
export function updateProfile(
  id: string,
  patch: {
    name?: string;
    server?: string;
    username?: string;
    password?: string;
    epgUrl?: string;
  },
) {
  const state = current();
  persist({
    ...state,
    profiles: state.profiles.map((p) =>
      p.id === id
        ? {
            ...p,
            ...(patch.name !== undefined ? { name: patch.name.trim() || p.name } : {}),
            ...(patch.server !== undefined ? { server: patch.server.trim() || p.server } : {}),
            ...(patch.username !== undefined
              ? { username: patch.username.trim() || p.username }
              : {}),
            ...(patch.password !== undefined ? { password: patch.password } : {}),
            ...(patch.epgUrl !== undefined ? { epgUrl: patch.epgUrl.trim() } : {}),
          }
        : p,
    ),
  });
}

/** Deselect the active playlist (keeps saved playlists). */
export function clearCreds() {
  persist({ ...current(), activeId: null });
}

export function useXtreamAuth() {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<State>(cache ?? { profiles: [], activeId: null });

  useEffect(() => {
    const initial = current();
    setState(initial);
    setReady(true);
    const listener = (s: State) => setState({ ...s });
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const logout = useCallback(() => clearCreds(), []);

  const active = state.profiles.find((p) => p.id === state.activeId) ?? null;

  return {
    creds: active as XtreamCreds | null,
    profile: active,
    profiles: state.profiles,
    ready,
    logout,
    selectProfile,
    removeProfile,
    renameProfile,
    updateProfile,
  };
}
