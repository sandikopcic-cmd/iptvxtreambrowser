import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Player } from "@/components/Player";
import { liveStreamUrl } from "@/lib/stream-url";
import { useXtreamAuth } from "@/lib/xtream-auth";
import { useHiddenCategories } from "@/lib/playlist-prefs";
import { xtreamCategories, xtreamLiveStreams, xtreamShortEpg } from "@/lib/xtream.functions";
import type { LiveChannel } from "@/lib/xtream-types";

function fmtTime(ts: number | null, fallback: string) {
  const ms = ts ? ts * 1000 : Date.parse(fallback.replace(" ", "T") + "Z");
  if (!Number.isFinite(ms)) return fallback;
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live TV — Streamdeck IPTV Player" },
      {
        name: "description",
        content: "Browse your Xtream live TV channels by category and watch them in the browser.",
      },
      { property: "og:title", content: "Live TV — Streamdeck" },
      { property: "og:description", content: "Watch your IPTV live channels in the browser." },
    ],
  }),
  component: () => (
    <AppShell>
      <LivePage />
    </AppShell>
  ),
});

function LivePage() {
  const { creds } = useXtreamAuth();
  const getCategories = useServerFn(xtreamCategories);
  const getStreams = useServerFn(xtreamLiveStreams);
  const getEpg = useServerFn(xtreamShortEpg);

  const { hiddenSet } = useHiddenCategories(creds?.username, "live");

  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LiveChannel | null>(null);

  const categories = useQuery({
    queryKey: ["live-categories", creds?.username],
    queryFn: () => getCategories({ data: { ...creds!, kind: "live" as const } }),
    enabled: !!creds,
    staleTime: 10 * 60 * 1000,
  });

  const channels = useQuery({
    queryKey: ["live-streams", creds?.username],
    queryFn: () => getStreams({ data: creds! }),
    enabled: !!creds,
    staleTime: 10 * 60 * 1000,
  });

  const epg = useQuery({
    queryKey: ["epg", creds?.username, selected?.id],
    queryFn: () => getEpg({ data: { ...creds!, streamId: selected!.id } }),
    enabled: !!creds && !!selected,
    staleTime: 60 * 1000,
  });

  const filtered = useMemo(() => {
    const list = channels.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter(
      (c) =>
        (category === "all"
          ? !hiddenSet.has(c.categoryId ?? "")
          : c.categoryId === category) &&
        (!q || c.name.toLowerCase().includes(q)),
    );
  }, [channels.data, category, search, hidden]);

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_320px_1fr]">
      <aside className="rounded-xl border border-border bg-card p-2">
        <h2 className="px-2 py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Categories
        </h2>
        <div className="max-h-[70vh] space-y-1 overflow-y-auto">
          <CategoryButton
            active={category === "all"}
            onClick={() => setCategory("all")}
            label="All channels"
          />
          {(categories.data ?? []).filter((c) => !hiddenSet.has(c.id)).map((c) => (
            <CategoryButton
              key={c.id}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
              label={c.name}
            />
          ))}
        </div>
      </aside>

      <section className="rounded-xl border border-border bg-card p-3">
        <div className="relative mb-3">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search channels"
            className="w-full rounded-md border border-input bg-background py-2 pr-3 pl-9 text-sm outline-none focus:border-ring"
          />
        </div>
        <div className="max-h-[68vh] space-y-1 overflow-y-auto">
          {channels.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
          {channels.isError && (
            <p className="p-3 text-sm text-destructive">{(channels.error as Error).message}</p>
          )}
          {filtered.slice(0, 800).map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-secondary ${
                selected?.id === c.id ? "bg-secondary text-foreground" : "text-muted-foreground"
              }`}
            >
              {c.icon ? (
                <img
                  src={c.icon}
                  alt=""
                  loading="lazy"
                  className="h-8 w-8 shrink-0 rounded bg-muted object-contain"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              ) : (
                <span className="h-8 w-8 shrink-0 rounded bg-muted" />
              )}
              <span className="truncate">{c.name}</span>
            </button>
          ))}
          {!channels.isLoading && filtered.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No channels found.</p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        {selected && creds ? (
          <>
            <Player
              key={selected.id}
              src={liveStreamUrl(creds, selected.id)}
              title={selected.name}
              poster={selected.icon}
            />
            <div className="rounded-xl border border-border bg-card p-4">
              <h1 className="text-lg font-semibold">{selected.name}</h1>
              <div className="mt-3 space-y-3">
                {(epg.data ?? []).slice(0, 3).map((e, i) => (
                  <div key={`${e.start}-${i}`} className="text-sm">
                    <p className="font-medium">
                      {i === 0 ? "Now: " : ""}
                      {e.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtTime(e.startTs, e.start)} — {fmtTime(e.endTs, e.end)}
                    </p>
                  </div>
                ))}
                {epg.data && epg.data.length === 0 && (
                  <p className="text-sm text-muted-foreground">No programme guide available.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            Pick a channel to start watching
          </div>
        )}
      </section>
    </div>
  );
}

function CategoryButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full truncate rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-secondary ${
        active ? "bg-secondary text-foreground" : "text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}
