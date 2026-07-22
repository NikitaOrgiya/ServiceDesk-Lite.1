import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

/**
 * Idempotently provisions the caller's own `public.profiles` row on first
 * login, calling the `ensure_profile` RPC (see
 * drizzle/0011_invite_only_profile_provisioning.sql). Neon has no
 * documented `auth.users`-equivalent trigger point, so this replaces the
 * Supabase prototype's `handle_new_user()` trigger — called once, right
 * after a successful sign-in (see actions/login.ts).
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
  const { error } = await client.rpc("ensure_profile");

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
