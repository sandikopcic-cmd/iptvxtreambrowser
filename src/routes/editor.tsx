import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  GripVertical,

  EyeOff,
  Save,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useXtreamAuth } from "@/lib/xtream-auth";
import {
  getCategoryOrder,
  getHidden,
  setCategoryOrder,
  setHidden,
  sortByOrder,
  type PlaylistKind,
} from "@/lib/playlist-prefs";
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
          "Hide the Xtream categories you never watch, reorder them and keep a clean, personalised IPTV playlist.",
      },
      { property: "og:title", content: "Playlist Editor — Streamdeck" },
      {
        property: "og:description",
        content: "Choose and reorder the live TV, movie and series categories in your player.",
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

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function EditorPage() {
  const { creds } = useXtreamAuth();
  const getCategories = useServerFn(xtreamCategories);

  const [kind, setKind] = useState<PlaylistKind>("live");
  const [search, setSearch] = useState("");
  const [hiddenDraft, setHiddenDraft] = useState<string[]>([]);
  const [orderDraft, setOrderDraft] = useState<string[]>([]);
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

  // Seed the order draft: saved order when present, otherwise categories grouped alphabetically.
  useEffect(() => {
    const cats = categories.data ?? [];
    if (cats.length === 0) {
      setOrderDraft([]);
      return;
    }
    const savedOrder = getCategoryOrder(creds?.username, kind);
    if (savedOrder.length > 0) {
      setOrderDraft(sortByOrder(cats, savedOrder).map((c) => c.id));
      return;
    }
    const rank = (name: string) => {
      const g = groupOf(name);
      return g === "OTHER" ? "\uffff" : g;
    };
    setOrderDraft(
      [...cats].sort((a, b) => rank(a.name).localeCompare(rank(b.name))).map((c) => c.id),
    );
  }, [categories.data, creds?.username, kind]);

  const ordered = useMemo(
    () => sortByOrder(categories.data ?? [], orderDraft),
    [categories.data, orderDraft],
  );

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ordered.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [ordered, search]);

  const hiddenSet = useMemo(() => new Set(hiddenDraft), [hiddenDraft]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof list>();
    for (const c of list) {
      const g = groupOf(c.name);
      const arr = map.get(g) ?? [];
      arr.push(c);
      map.set(g, arr);
    }
    // hidden items sink to the bottom within each group, and fully hidden
    // groups sink to the bottom of the list (stable otherwise)
    const entries = [...map.entries()].map(
      ([g, items]) =>
        [
          g,
          [
            ...items.filter((c) => !hiddenSet.has(c.id)),
            ...items.filter((c) => hiddenSet.has(c.id)),
          ],
        ] as [string, typeof list],
    );
    return entries
      .map((e, i) => ({
        e,
        i,
        allHidden: e[1].every((c) => hiddenSet.has(c.id)),
      }))
      .sort((a, b) =>
        a.allHidden === b.allHidden ? a.i - b.i : a.allHidden ? 1 : -1,
      )
      .map((x) => x.e);
  }, [list, hiddenSet]);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<{ type: "cat" | "group"; id: string } | null>(null);
  const searching = search.trim().length > 0;


  const dirty =
    JSON.stringify([...hiddenDraft].sort()) !==
      JSON.stringify([...getHidden(creds?.username, kind)].sort()) ||
    !sameIds(orderDraft, getCategoryOrder(creds?.username, kind));

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

  /** Split the current order into one contiguous block per group (first-appearance order). */
  const buildBlocks = (prev: string[]) => {
    const byId = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
    const blocks: { key: string; ids: string[] }[] = [];
    const index = new Map<string, number>();
    for (const cid of prev) {
      const g = groupOf(byId.get(cid) ?? "");
      const at = index.get(g);
      if (at === undefined) {
        index.set(g, blocks.length);
        blocks.push({ key: g, ids: [cid] });
      } else {
        blocks[at]!.ids.push(cid);
      }
    }
    return blocks;
  };

  /** Swap two category ids inside the saved order. */
  const swapCategories = (a: string, b: string) => {
    setSaved(false);
    setOrderDraft((prev) => {
      const ia = prev.indexOf(a);
      const ib = prev.indexOf(b);
      if (ia < 0 || ib < 0) return prev;
      const next = [...prev];
      next[ia] = b;
      next[ib] = a;
      return next;
    });
  };

  /** Move a category one slot up/down relative to what is displayed in its group. */
  const moveCategory = (id: string, dir: -1 | 1, siblings: string[]) => {
    const at = siblings.indexOf(id);
    const target = siblings[at + dir];
    if (at < 0 || !target) return;
    swapCategories(id, target);
  };

  /** Drag a category and drop it onto another one (inserts at that spot). */
  const dropCategory = (dragId: string, overId: string) => {
    if (dragId === overId) return;
    setSaved(false);
    setOrderDraft((prev) => {
      const without = prev.filter((x) => x !== dragId);
      const at = without.indexOf(overId);
      if (at < 0) return prev;
      const before = prev.indexOf(dragId) > prev.indexOf(overId);
      without.splice(before ? at : at + 1, 0, dragId);
      return without;
    });
  };

  /** Move a whole group block above/below its neighbouring group. */
  const moveGroup = (group: string, dir: -1 | 1) => {
    setSaved(false);
    setOrderDraft((prev) => {
      const blocks = buildBlocks(prev);
      const at = blocks.findIndex((b) => b.key === group);
      const swapWith = at + dir;
      if (at < 0 || swapWith < 0 || swapWith >= blocks.length) return prev;
      const next = [...blocks];
      [next[at], next[swapWith]] = [next[swapWith]!, next[at]!];
      return next.flatMap((b) => b.ids);
    });
  };

  /** Drag a group header and drop it onto another group. */
  const dropGroup = (dragKey: string, overKey: string) => {
    if (dragKey === overKey) return;
    setSaved(false);
    setOrderDraft((prev) => {
      const blocks = buildBlocks(prev);
      const from = blocks.findIndex((b) => b.key === dragKey);
      const to = blocks.findIndex((b) => b.key === overKey);
      if (from < 0 || to < 0) return prev;
      const next = [...blocks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next.flatMap((b) => b.ids);
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

  const resetOrder = () => {
    setSaved(false);
    const rank = (name: string) => {
      const g = groupOf(name);
      return g === "OTHER" ? "\uffff" : g;
    };
    setOrderDraft(
      [...(categories.data ?? [])]
        .sort((a, b) => rank(a.name).localeCompare(rank(b.name)))
        .map((c) => c.id),
    );
  };

  const save = () => {
    setHidden(creds?.username, kind, hiddenDraft);
    setCategoryOrder(creds?.username, kind, orderDraft);
    setSaved(true);
  };

  const total = categories.data?.length ?? 0;
  const visible = total - hiddenDraft.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Playlist editor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uncheck the categories you don't want to see and use the arrows to reorder them. Your
          choice is saved on this device and applied everywhere in the player.
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
          <button
            onClick={resetOrder}
            className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Reset order
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {categories.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
          {categories.isError && (
            <p className="p-3 text-sm text-destructive">{(categories.error as Error).message}</p>
          )}
          {searching && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Clear the search to reorder categories.
            </p>
          )}
          {groups.map(([group, items]) => {
            const ids = items.map((c) => c.id);
            const shownCount = ids.filter((id) => !hiddenSet.has(id)).length;
            const expanded = searching || open[group] === true;
            return (
              <div
                key={group}
                className={`mb-1 rounded-lg border border-border/60 ${
                  drag?.type === "group" && drag.id === group ? "opacity-50" : ""
                }`}
                onDragOver={(e) => {
                  if (drag?.type === "group") e.preventDefault();
                }}
                onDrop={(e) => {
                  if (drag?.type !== "group") return;
                  e.preventDefault();
                  dropGroup(drag.id, group);
                  setDrag(null);
                }}
              >
                <div className="flex items-center gap-2 rounded-t-lg bg-secondary/40 px-2 py-2">
                  {!searching && (
                    <span
                      draggable
                      onDragStart={() => setDrag({ type: "group", id: group })}
                      onDragEnd={() => setDrag(null)}
                      title={`Drag ${group}`}
                      className="shrink-0 cursor-grab p-1 text-muted-foreground active:cursor-grabbing"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen((p) => ({ ...p, [group]: !expanded }))}
                    className="flex flex-1 items-center gap-2 text-left text-sm font-medium"
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{group}</span>
                    <span className="text-xs text-muted-foreground">
                      {shownCount}/{items.length}
                    </span>
                  </button>
                  {!searching && (
                    <>
                      <IconButton
                        title={`Move ${group} up`}
                        onClick={() => moveGroup(group, -1)}
                        icon={<ChevronUp className="h-3.5 w-3.5" />}
                      />
                      <IconButton
                        title={`Move ${group} down`}
                        onClick={() => moveGroup(group, 1)}
                        icon={<ChevronDown className="h-3.5 w-3.5" />}
                      />
                    </>
                  )}
                  <IconButton
                    title={`Show all ${group}`}
                    onClick={() => setGroupVisible(ids, true)}
                    icon={<Eye className="h-3.5 w-3.5" />}
                  />
                  <IconButton
                    title={`Hide all ${group}`}
                    onClick={() => setGroupVisible(ids, false)}
                    icon={<EyeOff className="h-3.5 w-3.5" />}
                  />
                </div>
                {expanded && (
                  <div className="p-1">
                    {items.map((c) => {
                      const shown = !hiddenSet.has(c.id);
                      return (
                        <div
                          key={c.id}
                          onDragOver={(e) => {
                            if (drag?.type === "cat") e.preventDefault();
                          }}
                          onDrop={(e) => {
                            if (drag?.type !== "cat") return;
                            e.preventDefault();
                            e.stopPropagation();
                            dropCategory(drag.id, c.id);
                            setDrag(null);
                          }}
                          className={`flex items-center gap-1 rounded-md pr-1 hover:bg-secondary ${
                            drag?.type === "cat" && drag.id === c.id ? "opacity-50" : ""
                          }`}
                        >
                          {!searching && (
                            <span
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                setDrag({ type: "cat", id: c.id });
                              }}
                              onDragEnd={() => setDrag(null)}
                              title="Drag to reorder"
                              className="shrink-0 cursor-grab p-1 text-muted-foreground active:cursor-grabbing"
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                          )}
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={shown}
                            onClick={() => toggle(c.id)}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm"
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                shown
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border"
                              }`}
                            >
                              {shown && <Check className="h-3 w-3" />}
                            </span>
                            <span
                              className={`truncate ${
                                shown ? "text-foreground" : "text-muted-foreground line-through"
                              }`}
                            >
                              {c.name}
                            </span>
                          </button>
                          {!searching && (
                            <>
                              <IconButton
                                title="Move up"
                                onClick={() => moveCategory(c.id, -1, ids)}
                                icon={<ChevronUp className="h-3.5 w-3.5" />}
                              />
                              <IconButton
                                title="Move down"
                                onClick={() => moveCategory(c.id, 1, ids)}
                                icon={<ChevronDown className="h-3.5 w-3.5" />}
                              />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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

function IconButton({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      {icon}
    </button>
  );
}
