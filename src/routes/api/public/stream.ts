import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, X-Stream-Status",
  "Access-Control-Max-Age": "86400",
} as const;

function textResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Stream-Status": `proxy-${status}`,
    },
  });
}

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

async function inspectStream(
  upstream: Response,
): Promise<{ isPlaylist: boolean; body: BodyInit | null }> {
  if (!upstream.body) return { isPlaylist: false, body: null };

  const reader = upstream.body.getReader();
  const first = await reader.read();
  if (first.done || !first.value) {
    reader.releaseLock();
    return { isPlaylist: false, body: null };
  }

  const prefix = new TextDecoder().decode(first.value.slice(0, 64)).trimStart();
  if (prefix.startsWith("#EXTM3U")) {
    const chunks = [first.value];
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
    }
    const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { isPlaylist: true, body: new TextDecoder().decode(bytes) };
  }

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first.value);
      const pump = async () => {
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) {
              controller.close();
              break;
            }
            controller.enqueue(next.value);
          }
        } catch (error) {
          controller.error(error);
        }
      };
      void pump();
    },
    cancel() {
      return reader.cancel();
    },
  });
  return { isPlaylist: false, body };
}

export const Route = createFileRoute("/api/public/stream")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: CORS_HEADERS,
        }),
      GET: async ({ request }) => {
        const target = decodeTarget(new URL(request.url).searchParams.get("u") ?? "");
        if (!target) return textResponse("Invalid stream target", 400);

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
          return textResponse("Could not reach the stream server", 502);
        }

        const outHeaders = new Headers({
          ...CORS_HEADERS,
          "Cache-Control": "no-store",
          "X-Stream-Status": `upstream-${upstream.status}`,
        });

        if (!upstream.ok) {
          upstream.body?.cancel().catch(() => undefined);
          return new Response(`Stream provider returned HTTP ${upstream.status}`, {
            status: upstream.status,
            headers: {
              ...Object.fromEntries(outHeaders.entries()),
              "Content-Type": "text/plain; charset=utf-8",
            },
          });
        }

        let inspected: { isPlaylist: boolean; body: BodyInit | null };
        try {
          inspected = await inspectStream(upstream);
        } catch {
          upstream.body?.cancel().catch(() => undefined);
          return textResponse("The stream server closed the connection before sending media", 502);
        }

        if (inspected.isPlaylist) {
          outHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
          return new Response(rewritePlaylist(String(inspected.body ?? ""), new URL(upstream.url || target.toString())), {
            status: upstream.status,
            headers: outHeaders,
          });
        }

        for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
          const value = upstream.headers.get(key);
          if (value) outHeaders.set(key, value);
        }
        if (!outHeaders.has("content-type")) outHeaders.set("content-type", "video/mp2t");

        return new Response(inspected.body, { status: upstream.status, headers: outHeaders });
      },
    },
  },
});
