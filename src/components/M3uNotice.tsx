import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";

/** Shown on pages that need the Xtream API when the active playlist is a plain M3U list. */
export function M3uNotice({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-center">
      <Info className="mx-auto h-6 w-6 text-primary" />
      <h1 className="mt-3 text-lg font-semibold">{what} need an Xtream login</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This playlist was loaded from a plain M3U link, which only contains a channel list. Add the
        same provider with server, username and password to browse {what.toLowerCase()}.
      </p>
      <Link
        to="/live"
        className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Go to Live TV
      </Link>
    </div>
  );
}
