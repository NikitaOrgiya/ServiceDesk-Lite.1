import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type CurrentUser = {
  id: string;
  email: string | null;
};

/**
 * Resolves the caller's identity via `getClaims()`, which verifies the JWT
 * (against the project's JWKS, or the Auth server if needed) rather than
 * merely decoding whatever the `session` cookie happens to contain.
 * `supabase.auth.getSession()` is never used for this — it can return a
 * locally-cached session without confirming it's still valid server-side.
 *
 * Returns only the minimum needed to look up a profile — never the access
 * or refresh token, and never logged.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    const sanitized = sanitizeError(error);
    logger.warn({
      event: "auth:claims_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  const sub = data.claims.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    return null;
  }

  const email = typeof data.claims.email === "string" ? data.claims.email : null;

  return { id: sub, email };
}
