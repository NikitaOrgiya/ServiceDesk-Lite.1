"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/**
 * Browser-side Neon Auth client. Talks only to this app's own
 * app/api/auth/[...path] route (proxied to Neon Auth) — never holds a
 * Data API URL, cookie secret, or DATABASE_URL. Not currently used by any
 * form in this codebase (login/logout/reset run as Server Actions against
 * src/lib/auth/server.ts, matching the original architecture), but kept
 * available for client-side session state (e.g. `authClient.useSession()`)
 * if a future screen needs it without prop-drilling the profile down from
 * a layout.
 */
export const authClient = createAuthClient();
