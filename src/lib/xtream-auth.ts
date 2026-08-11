import { useCallback, useEffect, useState } from "react";
import type { XtreamCreds } from "./xtream-types";

const STORAGE_KEY = "xtream.creds";

let cache: XtreamCreds | null = null;
const listeners = new Set<(c: XtreamCreds | null) => void>();

function readStorage(): XtreamCreds | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<XtreamCreds>;
    if (!parsed.server || !parsed.username || !parsed.password) return null;
    return { server: parsed.server, username: parsed.username, password: parsed.password };
  } catch {
    return null;
  }
}

function emit(creds: XtreamCreds | null) {
  cache = creds;
  listeners.forEach((l) => l(creds));
}

export function saveCreds(creds: XtreamCreds) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  emit(creds);
}

export function clearCreds() {
  window.localStorage.removeItem(STORAGE_KEY);
  emit(null);
}

export function useXtreamAuth() {
  const [ready, setReady] = useState(false);
  const [creds, setCreds] = useState<XtreamCreds | null>(cache);

  useEffect(() => {
    const initial = cache ?? readStorage();
    cache = initial;
    setCreds(initial);
    setReady(true);
    const listener = (c: XtreamCreds | null) => setCreds(c);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const logout = useCallback(() => clearCreds(), []);

  return { creds, ready, logout };
}
