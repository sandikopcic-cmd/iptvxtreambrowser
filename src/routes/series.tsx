import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Search, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { M3uNotice } from "@/components/M3uNotice";
import { Player } from "@/components/Player";
import { episodeStreamUrl } from "@/lib/stream-url";
import { useXtreamAuth } from "@/lib/xtream-auth";
import { sortByOrder, useCategoryOrder, useHiddenCategories } from "@/lib/playlist-prefs";
import { xtreamCategories, xtreamSeriesInfo, xtreamSeriesList } from "@/lib/xtream.functions";
import type { Episode, SeriesItem } from "@/lib/xtream-types";

export const Route = createFileRoute("/series")({
  head: () => ({
    meta: [
      { title: "Series — Streamdeck IPTV Player" },
      {
        name: "description",
        content: "Browse series from your Xtream IPTV subscription and play episodes by season.",
      },
      { property: "og:title", content: "Series — Streamdeck" },
      { property: "og:description", content: "Watch IPTV series season by season in the browser." },
    ],
  }),
  component: () => (
    <AppShell>
      <SeriesPage />
    </AppShell>
  ),
});

function SeriesPage() {
  const { creds, profile } = useXtreamAuth();
  const isM3u = profile?.kind === "m3u";
  const getCategories = useServerFn(xtreamCategories);
  const getList = useServerFn(xtreamSeriesList);
  const getInfo = useServerFn(xtreamSeriesInfo);

  const { hidden, hiddenSet } = useHiddenCategories(creds?.username, "series");
  const { order } = useCategoryOrder(creds?.username, "series");

  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SeriesItem | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);

  const categories = useQuery({
    queryKey: ["series-categories", creds?.username],
    queryFn: () => getCategories({ data: { ...creds!, kind: "series" as const } }),
    enabled: !!creds,
    staleTime: 10 * 60 * 1000,
  });

  const list = useQuery({
    queryKey: ["series-list", creds?.username],
    queryFn: () => getList({ data: creds! }),
    enabled: !!creds,
    staleTime: 10 * 60 * 1000,
  });

  const detail = useQuery({
    queryKey: ["series-info", creds?.username, selected?.id],
    queryFn: () => getInfo({ data: { ...creds!, seriesId: selected!.id } }),
    enabled: !!creds && !!selected,
    staleTime: 10 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const items = list.data ?? [];
    const q = search.trim().toLowerCase();
    return items.filter(
      (s) =>
        (category === "all"
          ? !hiddenSet.has(s.categoryId ?? "")
          : s.categoryId === category) &&
        (!q || s.name.toLowerCase().includes(q)),
    );
  }, [list.data, category, search, hidden]);

  const seasons = detail.data?.seasons ?? [];
  const activeSeason = seasons.find((s) => s.season === season) ?? seasons[0];

  if (selected) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setSelected(null);
            setEpisode(null);
            setSeason(null);
          }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to series
        </button>

        {episode && creds && (
          <Player
            key={episode.id}
            src={episodeStreamUrl(creds, episode.id, episode.ext)}
            title={`${selected.name} — ${episode.title}`}
            poster={episode.image ?? selected.icon}
          />
        )}

        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          {selected.icon && !episode && (
            <img
              src={selected.icon}
              alt={selected.name}
              className="w-full rounded-xl border border-border object-cover"
            />
          )}
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold">{detail.data?.name ?? selected.name}</h1>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {detail.data?.releaseDate && <span>{detail.data.releaseDate}</span>}
                {detail.data?.genre && <span>{detail.data.genre}</span>}
                {detail.data?.rating && (
                  <span className="flex items-center gap-1 text-primary">
                    <Star className="h-3 w-3" /> {detail.data.rating}
                  </span>
                )}
              </div>
              {(detail.data?.plot ?? selected.plot) && (
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                  {detail.data?.plot ?? selected.plot}
                </p>
              )}
            </div>

            {detail.isLoading && <p className="text-sm text-muted-foreground">Loading episodes…</p>}

            {seasons.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {seasons.map((s) => (
                    <button
                      key={s.season}
                      onClick={() => setSeason(s.season)}
                      className={`rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary ${
                        activeSeason?.season === s.season
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      Season {s.season}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {(activeSeason?.episodes ?? []).map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setEpisode(e)}
                      className={`flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-secondary ${
                        episode?.id === e.id ? "bg-secondary" : ""
                      }`}
                    >
                      <span className="w-8 text-sm text-muted-foreground">{e.episodeNum}</span>
                      <span className="flex-1">
                        <span className="block text-sm">{e.title}</span>
                        {e.duration && (
                          <span className="block text-xs text-muted-foreground">{e.duration}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
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
            All series
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
            placeholder="Search series"
            className="w-full rounded-md border border-input bg-background py-2 pr-3 pl-9 text-sm outline-none focus:border-ring"
          />
        </div>
        {list.isLoading && <p className="text-sm text-muted-foreground">Loading library…</p>}
        {list.isError && <p className="text-sm text-destructive">{(list.error as Error).message}</p>}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.slice(0, 240).map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelected(s);
                setSeason(null);
                setEpisode(null);
              }}
              className="group text-left"
            >
              <div className="aspect-[2/3] overflow-hidden rounded-lg border border-border bg-muted">
                {s.icon && (
                  <img
                    src={s.icon}
                    alt={s.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground group-hover:text-foreground">
                {s.name}
              </p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
