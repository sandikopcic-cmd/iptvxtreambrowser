import { z } from "zod";

export const credsSchema = z.object({
  server: z.string().min(3).max(300),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});
