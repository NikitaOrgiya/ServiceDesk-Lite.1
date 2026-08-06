import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { logger } from "@/lib/logger/logger";
import { sanitizeError, isAuthRequiredError } from "@/lib/logger/sanitize-error";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The one specific, known-transient failure this retries: `ensure_profile()`
// (drizzle/0011_invite_only_profile_provisioning.sql) raises this generic,
// codeless-by-default Postgres exception (defaults to P0001) only when
// `auth.user_id()` resolves NULL for an otherwise-authenticated request — a
// structurally valid access token was sent (see AuthRequiredError below for
// the alternative, "no token at all" case) but the just-issued session
// hadn't yet propagated far enough for Postgres to resolve it. It is
// intentionally narrow: invitation/access-denial failures use ERRCODE
// '42501' and are never matched here, so they are never retried.
function isTransientAuthenticationFailure(sanitized: { code?: string; message: string }): boolean {
  return sanitized.code === "P0001" && sanitized.message === "Authentication required";
}

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
 *
 * Bounded retry: two simultaneous post-login completions (e.g. an employee
 * and an admin signing in at nearly the same instant) can intermittently
 * hit a narrow window where a just-issued session token isn't yet
 * resolvable — either as a thrown AuthRequiredError (no token at all for
 * this request yet) or, less commonly, as a token that Postgres's
 * `auth.user_id()` can't yet resolve (the RPC's own generic "Authentication
 * required" P0001). Both are retried up to MAX_ATTEMPTS times, each attempt
 * resolving a fresh access token via a fresh Data API client — nothing is
 * cached or reused across attempts. Every other failure (missing/used
 * invitation, inactive profile, any other Postgres error) returns false
 * immediately, with no retry.
 */
export async function ensureProfileForCurrentUser(): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const client = createDataApiClient();

    let error: unknown;
    try {
      ({ error } = await client.rpc("ensure_profile"));
    } catch (thrown) {
      // Same pending-token condition as getCurrentProfile() (see the comment
      // there) — the Data API's fetch wrapper throws rather than returning
      // `{ error }` when no access token is resolvable yet for this request.
      if (isAuthRequiredError(thrown)) {
        if (attempt < MAX_ATTEMPTS) {
          logger.warn({
            event: "auth:profile_provisioning_retry",
            message: `No access token resolvable yet on attempt ${attempt}/${MAX_ATTEMPTS}; retrying`,
          });
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        logger.warn({
          event: "auth:profile_provisioning_pending_session",
          message: "No access token resolvable yet for this request; provisioning deferred",
        });
        return false;
      }
      throw thrown;
    }

    if (!error) {
      return true;
    }

    const sanitized = sanitizeError(error);

    if (isTransientAuthenticationFailure(sanitized) && attempt < MAX_ATTEMPTS) {
      logger.warn({
        event: "auth:profile_provisioning_retry",
        message: `Transient provisioning authentication failure on attempt ${attempt}/${MAX_ATTEMPTS}; retrying`,
        code: sanitized.code,
      });
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    // ensure_profile() already logged the sanitized failure — never surface
    // it to the user (see src/app/auth/complete/route.ts).
    logger.error({
      event: "auth:profile_provisioning_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return false;
  }

  // Unreachable: the loop always returns before falling off the end.
  return false;
}
