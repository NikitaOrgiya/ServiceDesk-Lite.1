import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { serverEnv } from "@/lib/env/server";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Reads the caller's session from request cookies and uses the anon key —
 * this client is scoped to the current user, never the service role.
 *
 * Must be created fresh per request (it closes over the current cookie
 * store); do not turn this into a module-level singleton.
 *
 * Trust boundary: this client can read whatever cookies the request sent,
 * but that alone is not proof of identity. Server code must call
 * `supabase.auth.getClaims()` (verified against Supabase, not merely
 * decoded) before treating the caller as authenticated — see
 * src/features/auth/server/get-current-user.ts. Never branch on
 * `supabase.auth.getSession()` for an authorization decision.
 *
 * Not parametrized with a `Database` generic — see the same note in
 * browser.ts.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component that can't set cookies — the
            // session is still refreshed by src/proxy.ts on the next request.
          }
        },
      },
    }
  );
}
