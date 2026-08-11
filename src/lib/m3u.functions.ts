import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchM3u, parseM3u, xtreamFromM3uUrl, type M3uImport } from "./m3u.server";

const importSchema = z.object({
  url: z.string().min(5).max(2000),
  name: z.string().max(120).optional(),
});

export const importM3u = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => importSchema.parse(input))
  .handler(async ({ data }): Promise<M3uImport> => {
    const asXtream = xtreamFromM3uUrl(data.url);
    if (asXtream) return asXtream;

    const channels = parseM3u(await fetchM3u(data.url));
    if (channels.length === 0) throw new Error("No channels found in that playlist.");
    return { type: "m3u", name: data.name?.trim() || "M3U playlist", channels };
  });
