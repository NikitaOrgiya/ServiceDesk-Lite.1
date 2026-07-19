import "server-only";
import { z } from "zod";

import { clientEnv } from "@/lib/env/client";

/**
 * Server-only variables. `NEON_AUTH_BASE_URL`/`NEON_AUTH_COOKIE_SECRET`/
 * `NEON_DATA_API_URL` are required — the app cannot authenticate or read
 * ticket data without them. `DATABASE_URL`/`DATABASE_MIGRATION_URL`/
 * `NEON_API_KEY`/`NEON_PROJECT_ID`/`NEON_BRANCH_ID` are only consumed by
 * Drizzle Kit and server-only scripts (never by this Next.js app's request
 * handling), so they stay optional here and are read directly from
 * `process.env` where actually used (see drizzle.config.ts, scripts/*.ts).
 */
const serverEnvSchema = z.object({
  NEON_AUTH_BASE_URL: z.url(),
  NEON_AUTH_COOKIE_SECRET: z.string().min(32, "NEON_AUTH_COOKIE_SECRET must be at least 32 characters"),
  NEON_DATA_API_URL: z.url(),
});

function loadServerEnv() {
  const parsed = serverEnvSchema.safeParse({
    NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET,
    NEON_DATA_API_URL: process.env.NEON_DATA_API_URL,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid server environment variables: ${missing}`);
  }

  return parsed.data;
}

const serverOnlyEnv = loadServerEnv();

export const serverEnv = {
  ...clientEnv,
  ...serverOnlyEnv,
};
