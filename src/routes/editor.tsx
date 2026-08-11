import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, Save, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useXtreamAuth } from "@/lib/xtream-auth";
import { getHidden, setHidden, type PlaylistKind } from "@/lib/playlist-prefs";
import { xtreamCategories } from "@/lib/xtream.functions";

/** Derive a country/section group from a category name like "UK: Sky Sports". */
function groupOf(name: string): string {
  const n = name.trim();
  const m = n.match(/^([^:|]{1,18}?)\s*[:|]\s*\S/);
  if (m?.[1]) return m[1].trim().toUpperCase();
  const dash = n.match(/^([A-Za-z]{2,6})\s*[-–]\s+\S/);
  if (dash?.[1]) return dash[1].trim().toUpperCase();
  const first = n.split(/\s+/)[0];
  if (first && /^[A-Z]{2,6}$/.test(first)) return first;
  return "OTHER";
}


export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Playlist Editor — Streamdeck IPTV Player" },
      {
        name: "description",
        content:
          "Hide the Xtream categories you never watch and keep a clean, personalised IPTV playlist.",
      },
      { property: "og:title", content: "Playlist Editor — Streamdeck" },
      {
        property: "og:description",
        content: "Choose which live TV, movie and series categories appear in your player.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <EditorPage />
    </AppShell>
  ),
});

const kinds: { key: PlaylistKind; label: string }[] = [
  { key: "live", label: "Live TV" },
  { key: "vod", label: "Movies" },
  { key: "series", label: "Series" },
];

function EditorPage() {
  const { creds } = useXtreamAuth();
  const getCategories = useServerFn(xtreamCategories);

  const [kind, setKind] = useState<PlaylistKind>("live");
  const [search, setSearch] = useState("");
  const [hiddenDraft, setHiddenDraft] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const categories = useQuery({
    queryKey: [`${kind}-categories`, creds?.username],
    queryFn: () => getCategories({ data: { ...creds!, kind } }),
    enabled: !!creds,
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    setHiddenDraft(getHidden(creds?.username, kind));
    setSaved(false);
  }, [creds?.username, kind]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (categories.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [categories.data, search]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof list>();
    for (const c of list) {
      const g = groupOf(c.name);
      const arr = map.get(g) ?? [];
      arr.push(c);
      map.set(g, arr);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === "OTHER") return 1;
      if (b[0] === "OTHER") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [list]);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const searching = search.trim().length > 0;

  const hiddenSet = new Set(hiddenDraft);
  const dirty =
    JSON.stringify([...hiddenDraft].sort()) !==
    JSON.stringify([...getHidden(creds?.username, kind)].sort());

  const toggle = (id: string) => {
    setSaved(false);
    setHiddenDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const setGroupVisible = (ids: string[], visible: boolean) => {
    setSaved(false);
    setHiddenDraft((prev) => {
      const next = new Set(prev);
      for (const id of ids) (visible ? next.delete(id) : next.add(id));
      return [...next];
    });
  };


  const showAll = () => {
    setSaved(false);
    setHiddenDraft([]);
  };

  const hideAll = () => {
    setSaved(false);
    setHiddenDraft((categories.data ?? []).map((c) => c.id));
  };

  const save = () => {
    setHidden(creds?.username, kind, hiddenDraft);
    setSaved(true);
  };

  const total = categories.data?.length ?? 0;
  const visible = total - hiddenDraft.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Playlist editor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uncheck the categories you don't want to see. Your choice is saved on this device and
          applied everywhere in the player.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {kinds.map((k) => (
          <button
            key={k.key}
            onClick={() => setKind(k.key)}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${
              kind === k.key
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories"
              className="w-full rounded-md border border-input bg-background py-2 pr-3 pl-9 text-sm outline-none focus:border-ring"
            />
          </div>
          <button
            onClick={showAll}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" /> Show all
          </button>
          <button
            onClick={hideAll}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <EyeOff className="h-3.5 w-3.5" /> Hide all
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {categories.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
          {categories.isError && (
            <p className="p-3 text-sm text-destructive">{(categories.error as Error).message}</p>
          )}
          {list.map((c) => {
            const shown = !hiddenSet.has(c.id);
            return (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-secondary"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    shown ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  }`}
                >
                  {shown && <Check className="h-3 w-3" />}
                </span>
                <input
                  type="checkbox"
                  checked={shown}
                  onChange={() => toggle(c.id)}
                  className="sr-only"
                />
                <span className={shown ? "text-foreground" : "text-muted-foreground line-through"}>
                  {c.name}
                </span>
              </label>
            );
          })}
          {!categories.isLoading && list.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No categories found.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border p-3">
          <span className="text-xs text-muted-foreground">
            {visible} of {total} categories visible
          </span>
          <div className="ml-auto flex items-center gap-3">
            {saved && !dirty && <span className="text-xs text-primary">Saved</span>}
            <button
              onClick={save}
              disabled={!dirty}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
