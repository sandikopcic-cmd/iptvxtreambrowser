import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CloudCheck, Loader2, LogOut, MonitorPlay } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useCloudSync } from "@/lib/cloud-sync";
import { useNativeShell } from "@/lib/native-shell";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account — Streamdeck IPTV" },
      {
        name: "description",
        content:
          "Sign in to sync your IPTV playlists, favourites and category order across your Mac, phone and Fire TV.",
      },
      { property: "og:title", content: "Account — Streamdeck IPTV" },
      {
        property: "og:description",
        content: "Sync your IPTV playlists across every device you sign in on.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { session, ready, status } = useCloudSync();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/account" },
        });
        if (err) throw err;
        if (!data.session) {
          setMessage("Check your email to confirm the account, then sign in.");
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      void navigate({ to: "/" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/account",
    });
    if (result.error) {
      setError("Google sign-in failed. Try again.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/" });
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <MonitorPlay className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold uppercase tracking-[0.2em]">Streamdeck</span>
        </Link>

        {session ? (
          <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-center">
            <CloudCheck className="mx-auto h-8 w-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">Signed in</h1>
              <p className="text-sm text-muted-foreground">{session.user.email}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Your playlists, favourites, hidden categories and ordering sync automatically
              {status === "syncing" ? " (syncing…)" : ""}.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => void navigate({ to: "/" })}>Go to playlists</Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/";
                }}
              >
                <LogOut /> Sign out
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 rounded-xl border border-border bg-card p-6">
            <div className="text-center">
              <h1 className="text-lg font-semibold">
                {mode === "signin" ? "Sign in" : "Create an account"}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Keeps your IPTV playlists on every device — Mac, phone, Fire TV.
              </p>
            </div>

            <Button variant="outline" className="w-full" onClick={() => void google()}>
              Continue with Google
            </Button>

            <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>

            <form className="space-y-3" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              {message && <p className="text-xs text-muted-foreground">{message}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {mode === "signin"
                ? "No account yet? Create one"
                : "Already have an account? Sign in"}
            </button>

            <Link
              to="/"
              className="block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Continue without an account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
