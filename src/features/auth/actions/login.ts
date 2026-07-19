"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { loginFormSchema } from "@/features/auth/schema";
import { getCurrentProfile } from "@/features/auth/server/get-current-profile";
import { redirectByRole } from "@/features/auth/server/redirect-by-role";
import { sanitizeNextPath } from "@/features/auth/redirect";
import { maskEmail } from "@/features/auth/mask-email";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type LoginActionResult = {
  error: string;
};

const GENERIC_LOGIN_ERROR = "Не удалось войти. Проверьте email и пароль.";

/**
 * Server Action backing the login form. Re-validates with the same Zod
 * schema the client used (never trusts client-side validation alone), uses
 * `supabase.auth.signInWithPassword`, then loads the profile from
 * `public.profiles` to decide where to send the user — never from the
 * login form, a cookie, or Supabase metadata.
 *
 * On success this redirects (via `redirectByRole`/`redirect`, which throw)
 * and never returns. It only returns a value on failure, for the form to
 * display.
 */
export async function loginAction(input: unknown, next?: string | null): Promise<LoginActionResult> {
  const parsed = loginFormSchema.safeParse(input);

  if (!parsed.success) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    const sanitized = sanitizeError(signInError);
    logger.warn({
      event: "auth:login_failed",
      message: sanitized.message,
      code: sanitized.code,
      details: maskEmail(email),
    });
    return { error: GENERIC_LOGIN_ERROR };
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    logger.warn({
      event: "auth:profile_missing",
      message: "Login succeeded but the account has no profile row",
    });
    await supabase.auth.signOut();
    redirect("/unauthorized");
  }

  if (!profile.isActive) {
    logger.warn({
      event: "auth:inactive_profile",
      message: "Inactive profile attempted to log in",
    });
    await supabase.auth.signOut();
    redirect("/unauthorized");
  }

  redirectByRole(profile.role, sanitizeNextPath(next));
}
