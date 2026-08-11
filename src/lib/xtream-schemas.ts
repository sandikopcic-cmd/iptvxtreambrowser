import { z } from "zod";

export const credsSchema = z.object({
  server: z.string().min(3).max(300),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

export const categoriesSchema = credsSchema.extend({
  kind: z.enum(["live", "vod", "series"]),
});

export const vodInfoSchema = credsSchema.extend({ vodId: z.string().min(1).max(30) });
export const seriesInfoSchema = credsSchema.extend({ seriesId: z.string().min(1).max(30) });
export const epgSchema = credsSchema.extend({ streamId: z.string().min(1).max(30) });
