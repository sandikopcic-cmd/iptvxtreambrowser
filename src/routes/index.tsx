import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Loader2, MonitorPlay, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { xtreamLogin } from "@/lib/xtream.functions";
import { saveCreds, useXtreamAuth } from "@/lib/xtream-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Streamdeck — Xtream IPTV Player for Your Browser" },
      {
        name: "description",
        content:
          "Log in with your Xtream Codes server, username and password to watch live TV, movies and series directly in your browser.",
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

function LoginPage() {
  const navigate = useNavigate();
  const { creds, ready } = useXtreamAuth();
  const login = useServerFn(xtreamLogin);
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
      saveCreds(input);
      void navigate({ to: "/live" });
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <MonitorPlay className="h-10 w-10 text-primary" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Streamdeck</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your Xtream Codes details to watch live TV, movies and series in this
            browser.
          </p>
        </div>

        <form
          className="space-y-4 rounded-xl border border-border bg-card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({
              server: server.trim(),
              username: username.trim(),
              password,
            });
          }}
        >
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

          {mutation.isError && (
            <p className="text-sm text-destructive">
              {(mutation.error as Error).message || "Login failed."}
            </p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Connect
          </button>

          <p className="flex items-start gap-2 pt-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            Your credentials are kept in this browser only and are never stored on a server.
          </p>
        </form>
      </div>
    </div>
  );
}
