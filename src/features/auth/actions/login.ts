"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";
import { loginFormSchema } from "@/features/auth/schema";
import { ensureProfileForCurrentUser } from "@/features/auth/server/ensure-profile";
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
 * Neon Auth's `auth.signIn.email`, provisions the caller's `profiles` row
 * if this is their first sign-in (see ensureProfileForCurrentUser), then
 * loads the profile from `public.profiles` to decide where to send the
 * user — never from the login form or a cookie.
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

  const { data, error: signInError } = await auth.signIn.email({ email, password });

  if (signInError || !data?.user) {
    const sanitized = sanitizeError(signInError);
    logger.warn({
      event: "auth:login_failed",
      message: sanitized.message,
      code: sanitized.code,
      details: maskEmail(email),
    });
    return { error: GENERIC_LOGIN_ERROR };
  }

  await ensureProfileForCurrentUser();

  const profile = await getCurrentProfile();

  if (!profile) {
    logger.warn({
      event: "auth:profile_missing",
      message: "Login succeeded but the account has no profile row",
    });
    await auth.signOut();
    redirect("/unauthorized");
  }

  if (!profile.isActive) {
    logger.warn({
      event: "auth:inactive_profile",
      message: "Inactive profile attempted to log in",
    });
    await auth.signOut();
    redirect("/unauthorized");
  }

  redirectByRole(profile.role, sanitizeNextPath(next));
}
