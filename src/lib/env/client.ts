import { z } from "zod";

/**
 * Only variables safe to expose to the browser. Never add secret keys here —
 * this module is imported from Client Components. Neon Auth base URL, the
 * Data API URL, the auth cookie secret, and DATABASE_URL are all
 * server-only (see lib/env/server.ts) — the browser only ever talks to
 * this app's own Next.js routes, never directly to Neon.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
});

function loadClientEnv() {
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid public environment variables: ${missing}`);
  }

  return parsed.data;
}

export const clientEnv = loadClientEnv();
