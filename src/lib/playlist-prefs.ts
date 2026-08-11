import { useCallback, useEffect, useState } from "react";

export type PlaylistKind = "live" | "vod" | "series";

type PrefsShape = Record<string, string[]>;

const STORAGE_KEY = "xtream.hiddenCategories";
const ORDER_KEY = "xtream.categoryOrder";
const FAV_KEY = "xtream.favorites";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function readAll(key: string): PrefsShape {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
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

function readList(storeKey: string, account: string | undefined, kind: PlaylistKind): string[] {
  return readAll(storeKey)[keyFor(account, kind)] ?? [];
}

function writeList(
  storeKey: string,
  account: string | undefined,
  kind: PlaylistKind,
  ids: string[],
) {
  const all = readAll(storeKey);
  all[keyFor(account, kind)] = ids;
  window.localStorage.setItem(storeKey, JSON.stringify(all));
  notify();
}

/** Reactive subscription helper. */
function useStoredList(
  storeKey: string,
  account: string | undefined,
  kind: PlaylistKind,
): [string[], (ids: string[]) => void] {
  const [value, setValue] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setValue(readList(storeKey, account, kind));
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [storeKey, account, kind]);

  const save = useCallback(
    (ids: string[]) => writeList(storeKey, account, kind, ids),
    [storeKey, account, kind],
  );

  return [value, save];
}

/* ------------------------------- hidden ------------------------------- */

export function getHidden(account: string | undefined, kind: PlaylistKind): string[] {
  return readList(STORAGE_KEY, account, kind);
}

export function setHidden(account: string | undefined, kind: PlaylistKind, ids: string[]) {
  writeList(STORAGE_KEY, account, kind, ids);
}

/** Reactive set of hidden category ids for the given account + content kind. */
export function useHiddenCategories(account: string | undefined, kind: PlaylistKind) {
  const [hidden, save] = useStoredList(STORAGE_KEY, account, kind);
  return { hidden, hiddenSet: new Set(hidden), save };
}

/* -------------------------------- order -------------------------------- */

export function getCategoryOrder(account: string | undefined, kind: PlaylistKind): string[] {
  return readList(ORDER_KEY, account, kind);
}

export function setCategoryOrder(
  account: string | undefined,
  kind: PlaylistKind,
  ids: string[],
) {
  writeList(ORDER_KEY, account, kind, ids);
}

/** Sort categories by the saved custom order; unknown ids keep provider order at the end. */
export function sortByOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  if (order.length === 0) return items;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

export function useCategoryOrder(account: string | undefined, kind: PlaylistKind) {
  const [order, save] = useStoredList(ORDER_KEY, account, kind);
  return { order, save };
}

/* ------------------------------ favorites ------------------------------ */

export function getFavorites(account: string | undefined, kind: PlaylistKind): string[] {
  return readList(FAV_KEY, account, kind);
}

/** Reactive favorite stream ids for the given account + content kind. */
export function useFavorites(account: string | undefined, kind: PlaylistKind) {
  const [favorites, save] = useStoredList(FAV_KEY, account, kind);
  const favoriteSet = new Set(favorites);

  const toggleFavorite = useCallback(
    (id: string) => {
      const current = getFavorites(account, kind);
      save(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
    },
    [account, kind, save],
  );

  return { favorites, favoriteSet, toggleFavorite };
}
