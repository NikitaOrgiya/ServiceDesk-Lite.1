import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { logger } from "@/lib/logger/logger";
import { sanitizeError, isAuthRequiredError } from "@/lib/logger/sanitize-error";

/**
 * Idempotently provisions the caller's own `public.profiles` row on first
 * login, calling the `ensure_profile` RPC (see
 * drizzle/0011_invite_only_profile_provisioning.sql). Neon has no
 * documented `auth.users`-equivalent trigger point, so this replaces the
 * Supabase prototype's `handle_new_user()` trigger — called once, right
 * after a successful sign-in (see src/app/auth/login/route.ts).
 *
 * Invite-only: the RPC resolves the caller's email itself from the
 * trusted `neon_auth.user` table and only provisions a row if an unused
 * invitation exists for that email (full_name/department come from the
 * invitation, never from the caller) — an account with no invitation gets
 * `error` back and no profile is created. Never accepts a role from the
 * caller (always 'employee'), never updates an existing row, and is safe
 * to call on every login — a second call for an already-provisioned
 * account is a no-op.
 */
export async function ensureProfileForCurrentUser(): Promise<boolean> {
  const client = createDataApiClient();

  let error: unknown;
  try {
    ({ error } = await client.rpc("ensure_profile"));
  } catch (thrown) {
    // Same pending-token condition as getCurrentProfile() (see the comment
    // there) — the Data API's fetch wrapper throws rather than returning
    // `{ error }` when no access token is resolvable yet for this request.
    // Treat it as provisioning-not-yet-possible, not an unhandled crash.
    if (isAuthRequiredError(thrown)) {
      logger.warn({
        event: "auth:profile_provisioning_pending_session",
        message: "No access token resolvable yet for this request; provisioning deferred",
      });
      return false;
    }
    throw thrown;
  }

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "auth:profile_provisioning_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return false;
  }

  return true;
}
