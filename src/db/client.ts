import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";

/**
 * Direct, privileged Postgres connection via DATABASE_URL. This bypasses
 * RLS entirely (it connects as the database owner/migration role, not as
 * `authenticated`), so it must only be used for:
 *   - Drizzle Kit migrations
 *   - server-only setup scripts (scripts/*.ts)
 *   - SQL security tests
 *   - trusted administrative operations that cannot run as a given user
 *
 * Never import this from a Server Component, Server Action, or Route
 * Handler that serves a user-facing request — those must go through the
 * Neon Data API (src/lib/neon/data-api.ts), which enforces RLS with the
 * caller's own JWT. See docs/migration/supabase-to-neon.md.
 */
export function createDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured; the privileged Drizzle client is unavailable.");
  }

  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}
