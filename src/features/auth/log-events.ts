/**
 * Canonical vocabulary of auth-related `event` values passed to
 * `logger.*({ event: ... })`. Kept as plain strings at each call site (the
 * shared `LogPayload` type is intentionally generic across every domain,
 * not just auth) — this file exists so the full set is documented and
 * spelled consistently in one place.
 *
 * `user_lookup_failed` is reserved for a direct `supabase.auth.getUser()`
 * call path this stage doesn't have (identity is currently verified only
 * via `getClaims()` — see get-current-user.ts); it stays in the vocabulary
 * for when that path exists.
 */
export const AUTH_LOG_EVENTS = [
  "auth:login_failed",
  "auth:logout_failed",
  "auth:claims_failed",
  "auth:user_lookup_failed",
  "auth:profile_lookup_failed",
  "auth:profile_missing",
  "auth:inactive_profile",
  "auth:callback_failed",
  "auth:password_reset_request_failed",
  "auth:password_update_failed",
  "auth:role_denied",
] as const;
