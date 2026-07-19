import "server-only";
import { redirect } from "next/navigation";

import { getCurrentProfile, type CurrentProfile } from "@/features/auth/server/get-current-profile";
import { getCurrentUser } from "@/features/auth/server/get-current-user";
import { sanitizeNextPath } from "@/features/auth/redirect";
import { decideUserAccess } from "@/features/auth/access-decision";
import { logger } from "@/lib/logger/logger";

/**
 * Requires a signed-in, active user with a profile. Meant to be called from
 * a Server Component layout/page — it never returns for an unauthorized
 * caller, it redirects instead (so a missing profile never surfaces as an
 * unhandled exception/stack trace to the browser).
 *
 * The actual decision (login vs unauthorized vs allow) is the pure,
 * unit-tested decideUserAccess() — this function only resolves the real
 * inputs (Supabase identity + profile) and performs the corresponding
 * redirect.
 */
export async function requireUser(currentPath?: string): Promise<CurrentProfile> {
  const user = await getCurrentUser();
  const profile = user ? await getCurrentProfile() : null;

  const decision = decideUserAccess(user !== null, profile);

  if (decision.type === "redirect_to_login") {
    const next = sanitizeNextPath(currentPath);
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }

  if (decision.type === "redirect_to_unauthorized") {
    if (profile && !profile.isActive) {
      logger.warn({
        event: "auth:inactive_profile",
        message: "Inactive profile attempted to access a protected route",
      });
    }
    redirect("/unauthorized");
  }

  // decision.type === "allow" implies profile is non-null (see
  // decideUserAccess: "allow" is only reachable when profile is truthy).
  return profile as CurrentProfile;
}
