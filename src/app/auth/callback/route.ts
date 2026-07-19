import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { sanitizeAuthCallbackNextPath } from "@/features/auth/redirect";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

/**
 * Exchanges a Supabase Auth `code` (from a password-recovery email link)
 * for a session. Only ever redirects to an internal path validated by
 * sanitizeAuthCallbackNextPath — never to whatever the query string says
 * verbatim.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = sanitizeAuthCallbackNextPath(searchParams.get("next")) ?? "/login";

  if (!code) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const sanitized = sanitizeError(error);
    logger.warn({
      event: "auth:callback_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return NextResponse.redirect(new URL("/login", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
