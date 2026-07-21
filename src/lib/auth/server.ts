import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

import { serverEnv } from "@/lib/env/server";

/**
 * Single Neon Auth server instance for Server Components, Server Actions,
 * Route Handlers, and src/proxy.ts. Cookie-based session (Managed Better
 * Auth) — analogous in role to the old Supabase `server`/`proxy` clients,
 * but Neon Auth manages the cookie/session lifecycle itself rather than
 * this app manually refreshing cookies on every request.
 */
export const auth = createNeonAuth({
  baseUrl: serverEnv.NEON_AUTH_BASE_URL,
  cookies: {
    secret: serverEnv.NEON_AUTH_COOKIE_SECRET,
  },
});

/**
 * Returns a short-lived JWT for the current session (Better Auth's JWT
 * plugin `/token` endpoint — `sub` claim is the Neon Auth user id), or
 * `null` if there is no valid session. This is the only token ever handed
 * to the Neon Data API client (src/lib/neon/data-api.ts); it is never
 * logged and never sent to the browser.
 *
 * This mechanism (server-side retrieval of a Data API-compatible JWT) is
 * not exhaustively documented for the installed Neon Auth SDK version at
 * the time of this migration — see docs/migration/supabase-to-neon.md for
 * the residual Beta-API risk this accepted.
 */
export async function getUserAccessToken(): Promise<string | null> {
  const { data, error } = await auth.token();

  if (error || !data?.token) {
    return null;
  }

  return data.token;
}
