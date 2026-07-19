import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env/server";

/**
 * WARNING: this client bypasses Row Level Security via the Supabase
 * service-role key. It must only be called from trusted server-side code
 * (Route Handlers, Server Actions, background jobs) that has already
 * performed its own authorization checks — never expose it to a Client
 * Component, never call it in response to unauthenticated input, and never
 * log its output verbatim.
 *
 * Still not used anywhere in the UI at this stage (stage 3 only adds
 * authentication — see src/features/auth/server). In particular this client
 * must NOT be used for: ordinary login, checking a user's role, reading the
 * current user's own profile, working around RLS to render employee/admin
 * pages, or any request driven by unauthenticated input. Its only
 * legitimate use so far is a one-off, non-HTTP setup script (see
 * docs/database.md) — never a route handler reachable over the network.
 *
 * A factory function is used (instead of a module-level singleton) so that
 * a missing `SUPABASE_SERVICE_ROLE_KEY` only fails when this client is
 * actually requested, not at import/build time.
 *
 * Not parametrized with a `Database` generic — see the same note in
 * browser.ts.
 */
export function createAdminClient() {
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured; the admin client is unavailable."
    );
  }

  return createSupabaseClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
