import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env/client";
import type { Database } from "@/types/database";

/**
 * Supabase client for Client Components. Uses only public env vars and the
 * anon key — safe to bundle into browser JavaScript. Never import the admin
 * client from here.
 */
export function createClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
