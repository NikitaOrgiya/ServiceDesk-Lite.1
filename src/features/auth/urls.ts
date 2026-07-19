import { clientEnv } from "@/lib/env/client";

/**
 * Builds the URL Neon Auth's password-reset email links to. Better Auth's
 * email/password flow appends its own `token` query param to this exact
 * URL — unlike the Supabase-era flow, there is no separate `/auth/callback`
 * code-exchange step: `/reset-password` reads `token` straight off its own
 * search params (see src/app/(auth)/reset-password/page.tsx).
 */
export function getPasswordResetRedirectUrl(): string {
  return new URL("/reset-password", clientEnv.NEXT_PUBLIC_SITE_URL).toString();
}
