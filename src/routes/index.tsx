import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MonitorPlay,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { xtreamLogin } from "@/lib/xtream.functions";
import { importM3u } from "@/lib/m3u.functions";
import { saveCreds, saveM3uPlaylist, useXtreamAuth } from "@/lib/xtream-auth";
import { useCloudSync } from "@/lib/cloud-sync";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Streamdeck — Xtream IPTV Player for Your Browser" },
      {
        name: "description",
        content:
          "Save multiple Xtream Codes playlists and pick one to watch live TV, movies and series directly in your browser.",
      },
      { property: "og:title", content: "Streamdeck — Xtream IPTV Player" },
      {
        property: "og:description",
        content: "Watch your Xtream IPTV subscription in the browser: live TV, movies and series.",
      },
    ],
  }),
  component: LoginPage,
});

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* ignore */
        }
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="shrink-0 rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {done ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { creds, ready, profiles, selectProfile, removeProfile, updateProfile } = useXtreamAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [draft, setDraft] = useState({ name: "", server: "", username: "", password: "" });
  const cloud = useCloudSync();
  const login = useServerFn(xtreamLogin);
  const loadM3u = useServerFn(importM3u);
  const [mode, setMode] = useState<"xtream" | "m3u">("xtream");
  const [m3uUrl, setM3uUrl] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (ready && creds) void navigate({ to: "/live" });
  }, [ready, creds, navigate]);

  const mutation = useMutation({
    mutationFn: (input: { server: string; username: string; password: string }) =>
      login({ data: input }),
    onSuccess: (_account, input) => {
      saveCreds(input, name);
      void navigate({ to: "/live" });
    },
  });

  const m3uMutation = useMutation({
    mutationFn: (input: { url: string; name?: string }) => loadM3u({ data: input }),
    onSuccess: (result, input) => {
      if (result.type === "xtream") {
        saveCreds(
          { server: result.server, username: result.username, password: result.password },
          name,
        );
      } else {
        saveM3uPlaylist(name || result.name, input.url, result.channels);
      }
      void navigate({ to: "/live" });
    },
  });

  const hasProfiles = ready && profiles.length > 0;
  const formOpen = showForm || !hasProfiles;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <MonitorPlay className="h-10 w-10 text-primary" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Streamdeck</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasProfiles
              ? "Choose a playlist to load, or add another one."
              : "Add your Xtream Codes playlist to watch live TV, movies and series in this browser."}
          </p>
          <Link
            to="/account"
            className="mt-4 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {cloud.session
              ? `Synced to ${cloud.session.user.email}`
              : "Sign in to sync playlists across devices"}
          </Link>
        </div>

        {hasProfiles && (
          <ul className="mb-4 space-y-2">
            {profiles.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-card p-3">
                {editingId === p.id ? (
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      updateProfile(p.id, {
                        name: draft.name,
                        server: draft.server,
                        ...(p.kind === "m3u"
                          ? {}
                          : {
                              username: draft.username,
                              ...(draft.password ? { password: draft.password } : {}),
                            }),
                      });
                      setEditingId(null);
                    }}
                  >
                    <input
                      aria-label="Playlist name"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="Playlist name"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                    />
                    <div className="flex gap-2">
                      <input
                        aria-label={p.kind === "m3u" ? "M3U playlist URL" : "Server URL"}
                        value={draft.server}
                        onChange={(e) => setDraft({ ...draft, server: e.target.value })}
                        placeholder={
                          p.kind === "m3u"
                            ? "http://example.com/get.php?…&type=m3u_plus"
                            : "http://example.com:8080"
                        }
                        className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                      />
                      <CopyButton value={draft.server} label="URL" />
                    </div>
                    {p.kind === "m3u" && (
                      <p className="text-xs text-muted-foreground">
                        Changing the M3U link updates the saved source; re-add the playlist to
                        refresh its channels.
                      </p>
                    )}
                    {p.kind !== "m3u" && (
                      <>
                        <div className="flex gap-2">
                          <input
                            aria-label="Username"
                            value={draft.username}
                            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                            placeholder="Username"
                            className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                          />
                          <CopyButton value={draft.username} label="username" />
                        </div>
                        <div className="flex gap-2">
                          <input
                            aria-label="Password"
                            type={showSecret ? "text" : "password"}
                            value={draft.password}
                            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                            placeholder="Password"
                            className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                          />
                          <button
                            type="button"
                            aria-label={showSecret ? "Hide password" : "Show password"}
                            onClick={() => setShowSecret((v) => !v)}
                            className="shrink-0 rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          >
                            {showSecret ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                          <CopyButton value={draft.password} label="password" />
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2">
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {p.kind === "m3u"
                          ? draft.server
                          : `${draft.server.replace(/\/+$/, "")}/get.php?username=${encodeURIComponent(draft.username)}&password=${encodeURIComponent(draft.password)}&type=m3u_plus&output=ts`}
                      </span>
                      <CopyButton
                        value={
                          p.kind === "m3u"
                            ? draft.server
                            : `${draft.server.replace(/\/+$/, "")}/get.php?username=${encodeURIComponent(draft.username)}&password=${encodeURIComponent(draft.password)}&type=m3u_plus&output=ts`
                        }
                        label="full M3U link"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        selectProfile(p.id);
                        void navigate({ to: "/live" });
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                        <Play className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.server} · {p.username}
                        </span>
                      </span>
                    </button>
                    <button
                      aria-label={`Edit ${p.name}`}
                      onClick={() => {
                        setEditingId(p.id);
                        setShowSecret(false);
                        setDraft({
                          name: p.name,
                          server: p.server,
                          username: p.username,
                          password: p.password,
                        });
                      }}
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Remove ${p.name}`}
                      onClick={() => removeProfile(p.id)}
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {hasProfiles && !formOpen && (
          <button
            onClick={() => setShowForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add another playlist
          </button>
        )}

        {formOpen && (
          <form
            className="space-y-4 rounded-xl border border-border bg-card p-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (mode === "m3u") {
                m3uMutation.mutate({ url: m3uUrl.trim(), name: name.trim() });
                return;
              }
              mutation.mutate({
                server: server.trim(),
                username: username.trim(),
                password,
              });
            }}
          >
            {hasProfiles && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">New playlist</span>
                <button
                  type="button"
                  aria-label="Cancel"
                  onClick={() => setShowForm(false)}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 rounded-md bg-secondary p-1">
              {(
                [
                  ["xtream", "Xtream login"],
                  ["m3u", "M3U link"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === value
                      ? "bg-background text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <label htmlFor="name" className="text-xs font-medium text-muted-foreground">
                Playlist name (optional)
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Home IPTV"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </div>

            {mode === "m3u" ? (
              <div className="space-y-2">
                <label htmlFor="m3u" className="text-xs font-medium text-muted-foreground">
                  M3U playlist URL
                </label>
                <input
                  id="m3u"
                  required
                  value={m3uUrl}
                  onChange={(e) => setM3uUrl(e.target.value)}
                  placeholder="http://example.com:8080/get.php?username=…&password=…&type=m3u_plus"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
                <p className="text-xs text-muted-foreground">
                  Xtream <code>get.php</code> links are detected automatically and unlock movies and
                  series too. Other M3U links load as a channel list.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="server" className="text-xs font-medium text-muted-foreground">
                    Server URL
                  </label>
                  <input
                    id="server"
                    required
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    placeholder="http://example.com:8080"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="username" className="text-xs font-medium text-muted-foreground">
                    Username
                  </label>
                  <input
                    id="username"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                    Password
                  </label>
                  <input
                    id="password"
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                </div>
              </>
            )}

            {(mode === "m3u" ? m3uMutation.isError : mutation.isError) && (
              <p className="text-sm text-destructive">
                {((mode === "m3u" ? m3uMutation.error : mutation.error) as Error)?.message ||
                  "Could not load that playlist."}
              </p>
            )}

            <button
              type="submit"
              disabled={mutation.isPending || m3uMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {(mutation.isPending || m3uMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {mode === "m3u" ? "Load playlist" : "Save & connect"}
            </button>


            <p className="flex items-start gap-2 pt-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              Your playlists are kept in this browser only and are never stored on a server.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
