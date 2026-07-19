import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { serverEnv } from "@/lib/env/server";
import type { Database } from "@/types/database";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Reads the caller's session from request cookies and uses the anon key —
 * this client is scoped to the current user, never the service role.
 *
 * Must be created fresh per request (it closes over the current cookie
 * store); do not turn this into a module-level singleton.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
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
            // session is still refreshed by middleware in a later stage.
          }
        },
      },
    }
  );
}
