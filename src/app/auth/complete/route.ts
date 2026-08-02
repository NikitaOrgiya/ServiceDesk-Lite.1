import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";
import { getCurrentUser } from "@/features/auth/server/get-current-user";
import { ensureProfileForCurrentUser } from "@/features/auth/server/ensure-profile";
import { getCurrentProfile, type CurrentProfile } from "@/features/auth/server/get-current-profile";
import { decideUserAccess } from "@/features/auth/access-decision";
import { sanitizeNextPath, resolveRedirectTarget } from "@/features/auth/redirect";
import { logger } from "@/lib/logger/logger";

// Never statically prerendered: this route reads the incoming session
// cookie and calls the Data API on every request, and its result depends
// entirely on that request's identity.
export const dynamic = "force-dynamic";

/**
 * Second half of the login flow (see src/app/auth/login/route.ts
 * for why this is a separate request instead of being inlined into the
 * sign-in Server Action). The browser is redirected here immediately
 * after a successful `auth.signIn.email()`, so by the time this GET
 * request arrives, the browser has already resent the just-issued session
 * cookie as an ordinary incoming cookie — `auth.token()` (used
 * transitively by ensureProfileForCurrentUser/getCurrentProfile via
 * getUserAccessToken()) can now actually resolve it.
 *
 * Idempotent and safe to hit repeatedly: an already-provisioned profile
 * short-circuits inside `ensure_profile()` itself (see
 * drizzle/0011_invite_only_profile_provisioning.sql) without touching the
 * invitation again.
 */
export async function GET(request: NextRequest) {
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const loginUrl = new URL("/login", request.url);
  const unauthorizedUrl = new URL("/unauthorized", request.url);

  const user = await getCurrentUser();
  if (!user) {
    logger.warn({
      event: "auth:completion_session_missing",
      message: "Completion route reached with no resolvable session",
    });
    return NextResponse.redirect(loginUrl, 303);
  }

  const provisioned = await ensureProfileForCurrentUser();
  if (!provisioned) {
    // ensureProfileForCurrentUser() already logged the sanitized failure
    // (either an RPC-level error or a pending-session AuthRequiredError)
    // as auth:profile_provisioning_failed — never surface it to the user.
    await auth.signOut();
    return NextResponse.redirect(unauthorizedUrl, 303);
  }

  const profile = await getCurrentProfile();
  const decision = decideUserAccess(true, profile);

  if (decision.type !== "allow") {
    logger.warn({
      event: "auth:profile_missing_after_provisioning",
      message: "Provisioning reported success but no active profile is visible afterward",
    });
    await auth.signOut();
    return NextResponse.redirect(unauthorizedUrl, 303);
  }

  logger.info({
    event: "auth:login_completed",
    message: "Post-login provisioning completed",
  });

  // decision.type === "allow" implies profile is non-null (see
  // decideUserAccess: "allow" is only reachable when profile is truthy).
  const target = resolveRedirectTarget((profile as CurrentProfile).role, next);
  // Explicit 303: this response must always be re-fetched as a plain GET
  // navigation by the browser (never resolved as an RSC seed for a
  // client-dispatched request), so a stale client-router canonicalUrl from
  // a prior Server Action can never carry over into this navigation — see
  // src/app/auth/logout/route.ts for the failure mode this forecloses.
  return NextResponse.redirect(new URL(target, request.url), 303);
}
