import type { UserRole } from "@/features/auth/roles";

export type UserAccessDecision =
  | { type: "allow" }
  | { type: "redirect_to_login" }
  | { type: "redirect_to_unauthorized" };

type ProfileLike = { isActive: boolean } | null;

/**
 * Pure decision for requireUser(): given whether a Supabase session exists
 * at all, and the profile loaded for it (or null), decides what should
 * happen — no Next.js `redirect()` call here, so this is testable without
 * Supabase or Next.js. The caller (requireUser) performs the actual
 * redirect for each outcome.
 */
export function decideUserAccess(hasSession: boolean, profile: ProfileLike): UserAccessDecision {
  if (!hasSession) {
    return { type: "redirect_to_login" };
  }

  if (!profile) {
    return { type: "redirect_to_unauthorized" };
  }

  if (!profile.isActive) {
    return { type: "redirect_to_unauthorized" };
  }

  return { type: "allow" };
}

export type RoleAccessDecision = "allow" | "deny";

/** Pure decision for requireEmployee()/requireAdmin(). */
export function decideRoleAccess(actualRole: UserRole, requiredRole: UserRole): RoleAccessDecision {
  return actualRole === requiredRole ? "allow" : "deny";
}
