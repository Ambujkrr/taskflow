import { config } from "dotenv";
import { z } from "zod";
config({ path: new URL("../../.env", import.meta.url), quiet: true });
// dist/ and src/ have the same relative depth.
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_ORIGIN: z.url().transform((v) => new URL(v).origin),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  JWT_SECRET: z
    .string()
    .min(32)
    .refine(
      (v) => !v.startsWith("replace-with-"),
      "Generate a random JWT_SECRET",
    ),
});
// Render supplies the exact service URL; an explicit origin overrides it for custom domains.
const result = schema.safeParse({
  ...process.env,
  APP_ORIGIN: process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL,
});
if (!result.success)
  throw new Error(
    `Invalid environment variables: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
  );
export const env = result.data;
if (env.NODE_ENV === "production" && !env.APP_ORIGIN.startsWith("https://"))
  throw new Error("Production APP_ORIGIN must use HTTPS");
