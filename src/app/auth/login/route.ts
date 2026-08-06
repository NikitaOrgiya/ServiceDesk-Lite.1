import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";
import { loginFormSchema } from "@/features/auth/schema";
import { sanitizeNextPath } from "@/features/auth/redirect";
import { maskEmail } from "@/features/auth/mask-email";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

// Never statically prerendered: this route reads form-submitted
// credentials and calls Neon Auth on every request.
export const dynamic = "force-dynamic";

/**
 * POST /auth/login — native `<form method="post" action="/auth/login">`
 * target for the login form (see src/features/auth/login-form.tsx).
 *
 * This is a plain HTTP Route Handler rather than a Server Action
 * deliberately: Next.js traces every Server Function invocation to the
 * terminal in development by default, including its *arguments* (see
 * `logging.serverFunctions` in
 * node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/logging.md).
 * A form Server Action for login means the email and password are logged
 * in plaintext to the dev server terminal on every sign-in — this is the
 * credential leak this route replaces. A Route Handler is never subject to
 * that tracing path, and a native (non-JS-intercepted) form submission
 * never puts the password through client-side `fetch`/XHR at all.
 *
 * It also performs a real HTTP 303 redirect. Set-Cookie on this response
 * is guaranteed to be applied by the browser before the next request
 * fires, unlike a client-dispatched Server Action redirect, which targets
 * the router's in-memory `state.canonicalUrl` and can drift from
 * `window.location` — see src/app/auth/logout/route.ts for the concrete
 * failure that caused.
 *
 * Deliberately does NOT provision the profile or load it here: see
 * src/app/auth/complete/route.ts for why that is a separate, subsequent
 * request instead.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const next = sanitizeNextPath(formData.get("next")?.toString());

  const loginUrl = new URL("/login", request.url);
  if (next) {
    loginUrl.searchParams.set("next", next);
  }

  const parsed = loginFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    loginUrl.searchParams.set("error", "1");
    return NextResponse.redirect(loginUrl, 303);
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
    loginUrl.searchParams.set("error", "1");
    return NextResponse.redirect(loginUrl, 303);
  }

  logger.info({
    event: "auth:login_succeeded_pending_completion",
    message: "Sign-in succeeded; profile provisioning deferred to the completion route on the next request",
  });

  const completeUrl = new URL("/auth/complete", request.url);
  if (next) {
    completeUrl.searchParams.set("next", next);
  }

  return NextResponse.redirect(completeUrl, 303);
}
