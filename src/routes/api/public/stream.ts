import { createFileRoute } from "@tanstack/react-router";

function decodeTarget(raw: string): URL | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    const url = new URL(decoded);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function proxyPath(absolute: string): string {
  const b64 = Buffer.from(absolute, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `/api/public/stream?u=${b64}`;
}

function rewritePlaylist(body: string, baseUrl: URL): string {
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
          try {
            return `URI="${proxyPath(new URL(uri, baseUrl).toString())}"`;
          } catch {
            return `URI="${uri}"`;
          }
        });
      }
      try {
        return proxyPath(new URL(trimmed, baseUrl).toString());
      } catch {
        return line;
      }
    })
    .join("\n");
}

export const Route = createFileRoute("/api/public/stream")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type",
            "Access-Control-Max-Age": "86400",
          },
        }),
      GET: async ({ request }) => {
        const target = decodeTarget(new URL(request.url).searchParams.get("u") ?? "");
        if (!target) return new Response("Invalid stream target", { status: 400 });

        const headers: Record<string, string> = {
          "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
          Accept: "*/*",
        };
        const range = request.headers.get("range");
        if (range) headers["Range"] = range;

        let upstream: Response;
        try {
          upstream = await fetch(target.toString(), { headers, redirect: "follow" });
        } catch {
          return new Response("Could not reach the stream server", { status: 502 });
        }

        const contentType = upstream.headers.get("content-type") ?? "";
        const isPlaylist =
          target.pathname.endsWith(".m3u8") ||
          contentType.includes("mpegurl") ||
          contentType.includes("m3u");

        const outHeaders = new Headers({
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        });

        if (isPlaylist && upstream.ok) {
          const text = await upstream.text();
          outHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
          return new Response(rewritePlaylist(text, new URL(upstream.url || target.toString())), {
            status: upstream.status,
            headers: outHeaders,
          });
        }

        for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
          const value = upstream.headers.get(key);
          if (value) outHeaders.set(key, value);
        }
        if (!outHeaders.has("content-type")) outHeaders.set("content-type", "video/mp2t");

        return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
      },
    },
  },
});
