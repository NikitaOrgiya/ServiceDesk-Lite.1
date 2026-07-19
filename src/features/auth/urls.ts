import { clientEnv } from "@/lib/env/client";

/**
 * Builds the `/auth/callback` URL used as `emailRedirectTo`/`redirectTo` for
 * Supabase Auth email flows (password recovery). Single place that knows
 * this shape, built from `NEXT_PUBLIC_SITE_URL` — no separate
 * "password reset URL" env var is needed.
 *
 * This exact URL must be present in the Supabase project's Auth ->
 * URL Configuration -> Redirect URLs allow-list, or Supabase will refuse to
 * honor it — see docs/database.md.
 */
export function getAuthCallbackUrl(next: string): string {
  const url = new URL("/auth/callback", clientEnv.NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("next", next);
  return url.toString();
}
