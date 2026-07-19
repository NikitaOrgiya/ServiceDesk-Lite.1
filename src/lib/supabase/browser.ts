import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env/client";

/**
 * Supabase client for Client Components. Uses only public env vars and the
 * anon key — safe to bundle into browser JavaScript. Never import the admin
 * client from here, and never use this client to decide what a user is
 * allowed to see — server-side code re-checks identity and role for every
 * protected route (see src/features/auth/server).
 *
 * Not parametrized with a `Database` generic: `src/types/database.ts` is
 * still the stage-1/2 placeholder (type generation needs a reachable local
 * or linked Supabase project, see docs/database.md) — pretending it
 * describes the real schema would be worse than no types at all. Swap it in
 * once `supabase gen types` has actually run.
 */
export function createClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
