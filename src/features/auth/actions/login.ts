"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";
import { loginFormSchema } from "@/features/auth/schema";
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
 * schema the client used (never trusts client-side validation alone) and
 * calls Neon Auth's `auth.signIn.email` — nothing else.
 *
 * Deliberately does NOT provision the profile or load it here: the
 * session cookie `signIn.email` sets on this response is not yet the
 * *incoming* cookie of this same request/action invocation, so a
 * same-request call to `auth.token()` (which ensureProfileForCurrentUser/
 * getCurrentProfile both need, via getUserAccessToken()) can resolve no
 * session and silently run the Data API call unauthenticated. This is
 * exactly the bug that shipped to production: a real session got created,
 * but the invite-only `ensure_profile()` RPC never actually ran against
 * it, so the invitation stayed unused and no profile was created — see
 * src/app/auth/complete/route.ts, which performs provisioning on the
 * *next* HTTP request, once the browser has actually resent the new
 * session cookie.
 *
 * On success this redirects (via `redirect`, which throws) to the
 * completion route and never returns a value. It only returns a value on
 * failure, for the form to display.
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

  logger.info({
    event: "auth:login_succeeded_pending_completion",
    message: "Sign-in succeeded; profile provisioning deferred to the completion route on the next request",
  });

  const sanitizedNext = sanitizeNextPath(next);
  const completionUrl = sanitizedNext
    ? `/auth/complete?next=${encodeURIComponent(sanitizedNext)}`
    : "/auth/complete";

  redirect(completionUrl);
}
