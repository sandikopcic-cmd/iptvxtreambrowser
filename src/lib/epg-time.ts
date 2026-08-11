import { useCallback, useEffect, useState } from "react";

const OFFSET_KEY = "xtream.epgOffsetHours";

/** Parse an EPG entry into a UTC epoch (ms), or null. */
export function epgMs(ts: number | null, fallback: string): number | null {
  if (ts && Number.isFinite(ts) && ts > 0) return ts * 1000;
  const raw = (fallback ?? "").trim();
  if (!raw) return null;
  // Xtream returns "YYYY-MM-DD HH:MM:SS" (UTC) or an ISO string with an offset.
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
    ? raw.replace(" ", "T")
    : `${raw.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Format an EPG time in the viewer's local timezone (Slovenia = Europe/Ljubljana). */
export function formatEpgTime(ms: number | null, offsetHours = 0): string {
  if (ms === null) return "—";
  return new Date(ms + offsetHours * 3600_000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Manual correction for providers that publish EPG in their own timezone. */
export function useEpgOffset(): [number, (hours: number) => void] {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const raw = window.localStorage.getItem(OFFSET_KEY);
    const n = raw === null ? 0 : Number(raw);
    if (Number.isFinite(n)) setOffset(n);
  }, []);

  const save = useCallback((hours: number) => {
    setOffset(hours);
    window.localStorage.setItem(OFFSET_KEY, String(hours));
  }, []);

  return [offset, save];
}
