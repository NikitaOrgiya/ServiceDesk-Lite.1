import "server-only";
import { NeonPostgrestClient, fetchWithToken } from "@neondatabase/postgrest-js";

import { serverEnv } from "@/lib/env/server";
import { getUserAccessToken } from "@/lib/auth/server";

/**
 * Neon Data API client for Server Components, Server Actions and Route
 * Handlers. Scoped to the current request's session — every query and RPC
 * call runs as `authenticated` under Postgres RLS with the caller's own
 * JWT (via getUserAccessToken(), resolved lazily per request by
 * fetchWithToken — never cached across requests or users).
 *
 * Must be created fresh per call site (like the old Supabase server
 * client); do not turn this into a module-level singleton, and never use
 * DATABASE_URL here — that would bypass RLS entirely (see src/db/client.ts
 * for the privileged, RLS-bypassing counterpart and where it is actually
 * allowed to be used).
 */
export function createDataApiClient() {
  return new NeonPostgrestClient({
    dataApiUrl: serverEnv.NEON_DATA_API_URL,
    options: {
      global: {
        fetch: fetchWithToken(getUserAccessToken),
      },
    },
  });
}
