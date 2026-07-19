import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env/server";
import type { Database } from "@/types/database";

/**
 * WARNING: this client bypasses Row Level Security via the Supabase
 * service-role key. It must only be called from trusted server-side code
 * (Route Handlers, Server Actions, background jobs) that has already
 * performed its own authorization checks — never expose it to a Client
 * Component, never call it in response to unauthenticated input, and never
 * log its output verbatim.
 *
 * Not used anywhere in the UI at this stage. Exists so the boundary is in
 * place before real admin operations are implemented in a later stage.
 *
 * A factory function is used (instead of a module-level singleton) so that
 * a missing `SUPABASE_SERVICE_ROLE_KEY` only fails when this client is
 * actually requested, not at import/build time.
 */
export function createAdminClient() {
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured; the admin client is unavailable."
    );
  }

  return createSupabaseClient<Database>(
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
