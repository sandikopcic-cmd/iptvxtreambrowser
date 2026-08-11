import { useCallback, useEffect, useState } from "react";

export type PlaylistKind = "live" | "vod" | "series";

type PrefsShape = Record<string, string[]>;

const STORAGE_KEY = "xtream.hiddenCategories";

const listeners = new Set<() => void>();

function readAll(): PrefsShape {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as PrefsShape;
  } catch {
    return {};
  }
}

function keyFor(account: string | undefined, kind: PlaylistKind) {
  return `${account ?? "anon"}::${kind}`;
}

export function getHidden(account: string | undefined, kind: PlaylistKind): string[] {
  return readAll()[keyFor(account, kind)] ?? [];
}

export function setHidden(account: string | undefined, kind: PlaylistKind, ids: string[]) {
  const all = readAll();
  all[keyFor(account, kind)] = ids;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  listeners.forEach((l) => l());
}

/** Reactive set of hidden category ids for the given account + content kind. */
export function useHiddenCategories(account: string | undefined, kind: PlaylistKind) {
  const [hidden, setHiddenState] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setHiddenState(getHidden(account, kind));
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [account, kind]);

  const save = useCallback(
    (ids: string[]) => {
      setHidden(account, kind, ids);
    },
    [account, kind],
  );

  return { hidden, hiddenSet: new Set(hidden), save };
}
