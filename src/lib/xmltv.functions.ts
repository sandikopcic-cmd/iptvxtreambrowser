import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { xmltvEpg } from "./xmltv.server";
import type { EpgEntry } from "./xtream-types";

const schema = z.object({
  url: z.string().min(5).max(2000),
  channelId: z.string().min(1).max(300),
});

export const xmltvChannelEpg = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }): Promise<EpgEntry[]> => xmltvEpg(data.url, data.channelId));
