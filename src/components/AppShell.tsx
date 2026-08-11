import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Radio, Clapperboard, Tv, MonitorPlay, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useXtreamAuth } from "@/lib/xtream-auth";

const tabs = [
  { to: "/live", label: "Live TV", icon: Radio },
  { to: "/vod", label: "Movies", icon: Clapperboard },
  { to: "/series", label: "Series", icon: Tv },
  { to: "/editor", label: "Editor", icon: SlidersHorizontal },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { creds, profile, profiles, ready, logout, selectProfile } = useXtreamAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !creds) void navigate({ to: "/" });
  }, [ready, creds, navigate]);


  if (!ready || !creds) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-primary/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-6 px-4">
          <Link to="/live" className="flex items-center gap-2">
            <MonitorPlay className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold tracking-[0.2em] uppercase">Streamdeck</span>
          </Link>
          <nav className="flex items-center gap-1">
            {tabs.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-foreground"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{creds.username}</span>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  );
}
