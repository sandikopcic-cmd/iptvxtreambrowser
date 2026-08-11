import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Search, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { M3uNotice } from "@/components/M3uNotice";
import { Player } from "@/components/Player";
import { movieStreamUrl } from "@/lib/stream-url";
import { useXtreamAuth } from "@/lib/xtream-auth";
import { sortByOrder, useCategoryOrder, useHiddenCategories } from "@/lib/playlist-prefs";
import { xtreamCategories, xtreamVodInfo, xtreamVodStreams } from "@/lib/xtream.functions";
import type { VodItem } from "@/lib/xtream-types";

export const Route = createFileRoute("/vod")({
  head: () => ({
    meta: [
      { title: "Movies — Streamdeck IPTV Player" },
      {
        name: "description",
        content: "Browse and stream the movie library from your Xtream IPTV subscription.",
      },
      { property: "og:title", content: "Movies — Streamdeck" },
      { property: "og:description", content: "Stream your IPTV movie library in the browser." },
    ],
  }),
  component: () => (
    <AppShell>
      <VodPage />
    </AppShell>
  ),
});

function VodPage() {
  const { creds, profile } = useXtreamAuth();
  const isM3u = profile?.kind === "m3u";
  const getCategories = useServerFn(xtreamCategories);
  const getStreams = useServerFn(xtreamVodStreams);
  const getInfo = useServerFn(xtreamVodInfo);

  const { hidden, hiddenSet } = useHiddenCategories(creds?.username, "vod");
  const { order } = useCategoryOrder(creds?.username, "vod");

  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<VodItem | null>(null);
  const [playing, setPlaying] = useState(false);

  const categories = useQuery({
    queryKey: ["vod-categories", creds?.username],
    queryFn: () => getCategories({ data: { ...creds!, kind: "vod" as const } }),
    enabled: !!creds,
    staleTime: 10 * 60 * 1000,
  });

  const movies = useQuery({
    queryKey: ["vod-streams", creds?.username],
    queryFn: () => getStreams({ data: creds! }),
    enabled: !!creds,
    staleTime: 10 * 60 * 1000,
  });

  const detail = useQuery({
    queryKey: ["vod-info", creds?.username, selected?.id],
    queryFn: () => getInfo({ data: { ...creds!, vodId: selected!.id } }),
    enabled: !!creds && !!selected,
    staleTime: 10 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const list = movies.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter(
      (m) =>
        (category === "all"
          ? !hiddenSet.has(m.categoryId ?? "")
          : m.categoryId === category) &&
        (!q || m.name.toLowerCase().includes(q)),
    );
  }, [movies.data, category, search, hidden]);

  if (selected) {
    const ext = detail.data?.ext ?? selected.ext ?? "mp4";
    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setSelected(null);
            setPlaying(false);
          }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to movies
        </button>

        {playing && creds ? (
          <Player
            src={movieStreamUrl(creds, selected.id, ext)}
            title={selected.name}
            poster={selected.icon}
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-[260px_1fr]">
            {selected.icon && (
              <img
                src={selected.icon}
                alt={selected.name}
                className="w-full rounded-xl border border-border object-cover"
              />
            )}
            <div className="space-y-3">
              <h1 className="text-2xl font-semibold">{detail.data?.name ?? selected.name}</h1>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {detail.data?.releaseDate && <span>{detail.data.releaseDate}</span>}
                {detail.data?.duration && <span>{detail.data.duration}</span>}
                {detail.data?.genre && <span>{detail.data.genre}</span>}
                {detail.data?.rating && (
                  <span className="flex items-center gap-1 text-primary">
                    <Star className="h-3 w-3" /> {detail.data.rating}
                  </span>
                )}
              </div>
              {detail.data?.plot && (
                <p className="max-w-2xl text-sm text-muted-foreground">{detail.data.plot}</p>
              )}
              {detail.data?.cast && (
                <p className="text-xs text-muted-foreground">Cast: {detail.data.cast}</p>
              )}
              <button
                onClick={() => setPlaying(true)}
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Play movie
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="rounded-xl border border-border bg-card p-2">
        <h2 className="px-2 py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Categories
        </h2>
        <div className="max-h-[70vh] space-y-1 overflow-y-auto">
          <button
            onClick={() => setCategory("all")}
            className={`w-full rounded-md px-2 py-2 text-left text-sm hover:bg-secondary ${category === "all" ? "bg-secondary" : "text-muted-foreground"}`}
          >
            All movies
          </button>
          {sortByOrder(
            (categories.data ?? []).filter((c) => !hiddenSet.has(c.id)),
            order,
          ).map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`w-full truncate rounded-md px-2 py-2 text-left text-sm hover:bg-secondary ${category === c.id ? "bg-secondary" : "text-muted-foreground"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </aside>

      <section>
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search movies"
            className="w-full rounded-md border border-input bg-background py-2 pr-3 pl-9 text-sm outline-none focus:border-ring"
          />
        </div>
        {movies.isLoading && <p className="text-sm text-muted-foreground">Loading library…</p>}
        {movies.isError && (
          <p className="text-sm text-destructive">{(movies.error as Error).message}</p>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.slice(0, 240).map((m) => (
            <button key={m.id} onClick={() => setSelected(m)} className="group text-left">
              <div className="aspect-[2/3] overflow-hidden rounded-lg border border-border bg-muted">
                {m.icon && (
                  <img
                    src={m.icon}
                    alt={m.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground group-hover:text-foreground">
                {m.name}
              </p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
