import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

/**
 * Idempotently provisions the caller's own `public.profiles` row on first
 * login, calling the `ensure_profile` RPC (see
 * drizzle/0010_profile_provisioning.sql). Neon has no documented
 * `auth.users`-equivalent trigger point, so this replaces the Supabase
 * prototype's `handle_new_user()` trigger — called once, right after a
 * successful sign-in (see actions/login.ts).
 *
 * Never accepts a role from the caller (the RPC always assigns
 * 'employee'), never updates an existing row, and is safe to call on every
 * login — a second call is a no-op.
 */
export async function ensureProfileForCurrentUser(displayName: string | null): Promise<boolean> {
  const client = createDataApiClient();
  const { error } = await client.rpc("ensure_profile", { p_full_name: displayName ?? "" });

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
