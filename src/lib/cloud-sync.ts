import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keys that make up a user's Streamdeck setup. They are mirrored into the
 * `user_sync` table so the same playlists, favourites, hidden categories and
 * ordering show up on every device the user signs in on (Mac, Firestick, …).
 */
const SYNC_KEYS = [
  "xtream.profiles",
  "xtream.activeProfile",
  "xtream.hiddenCategories",
  "xtream.categoryOrder",
  "xtream.favorites",
  "xtream.epgOffsetHours",
];

const M3U_PREFIX = "m3u.channels.";

type Snapshot = Record<string, string>;

function snapshot(): Snapshot {
  const out: Snapshot = {};
  for (const key of SYNC_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value !== null) out[key] = value;
  }
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(M3U_PREFIX)) continue;
    const value = window.localStorage.getItem(key);
    // Skip oversized imported playlists so the sync payload stays reasonable.
    if (value && value.length < 1_500_000) out[key] = value;
  }
  return out;
}

function apply(data: Snapshot) {
  for (const key of SYNC_KEYS) {
    if (key in data) window.localStorage.setItem(key, data[key]!);
    else window.localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith(M3U_PREFIX)) window.localStorage.setItem(key, value);
  }
}

function isEmpty(data: Snapshot | null | undefined) {
  if (!data) return true;
  const profiles = data["xtream.profiles"];
  if (!profiles) return true;
  try {
    return (JSON.parse(profiles) as unknown[]).length === 0;
  } catch {
    return true;
  }
}

async function pull(userId: string): Promise<Snapshot | null> {
  const { data, error } = await supabase
    .from("user_sync")
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return (data?.payload as Snapshot | undefined) ?? null;
}

async function push(userId: string, payload: Snapshot) {
  await supabase
    .from("user_sync")
    .upsert({ user_id: userId, payload }, { onConflict: "user_id" });
}

export type CloudSyncState = {
  session: Session | null;
  ready: boolean;
  status: "idle" | "syncing" | "synced" | "error";
};

/**
 * Keeps the local playlist setup and the signed-in account in sync.
 * Mounted once (root layout). On sign-in the cloud copy wins unless the
 * account is still empty, in which case the local playlists are uploaded.
 */
export function useCloudSync(): CloudSyncState {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<CloudSyncState["status"]>("idle");

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    let cancelled = false;
    let last = "";

    const start = async () => {
      setStatus("syncing");
      const remote = await pull(userId);
      if (cancelled) return;
      const local = snapshot();

      if (isEmpty(remote) && !isEmpty(local)) {
        // First sign-in on a device that already has playlists: upload them.
        await push(userId, local);
        last = JSON.stringify(local);
      } else if (remote && JSON.stringify(remote) !== JSON.stringify(local)) {
        apply(remote);
        last = JSON.stringify(remote);
        setStatus("synced");
        window.location.reload();
        return;
      } else {
        last = JSON.stringify(local);
      }
      if (!cancelled) setStatus("synced");
    };

    void start();

    // Push local changes (new playlist, favourite, reorder) up shortly after.
    const timer = window.setInterval(() => {
      if (cancelled) return;
      const current = JSON.stringify(snapshot());
      if (current === last) return;
      last = current;
      void push(userId, JSON.parse(current) as Snapshot);
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.user?.id]);

  return { session, ready, status };
}

export async function signOutCloud() {
  await supabase.auth.signOut();
}
