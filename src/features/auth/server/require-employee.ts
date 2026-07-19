import "server-only";
import { redirect } from "next/navigation";

import { requireUser } from "@/features/auth/server/require-user";
import type { CurrentProfile } from "@/features/auth/server/get-current-profile";
import { decideRoleAccess } from "@/features/auth/access-decision";
import { logger } from "@/lib/logger/logger";

/**
 * Requires an active profile with role = 'employee'. An admin is NOT
 * automatically an employee here — the employee section (`/app/**`) and
 * the admin section (`/admin/**`) are treated as disjoint, so an admin
 * visiting `/app` is bounced the same as anyone else without the role.
 */
export async function requireEmployee(currentPath?: string): Promise<CurrentProfile> {
  const profile = await requireUser(currentPath);

  if (decideRoleAccess(profile.role, "employee") === "deny") {
    logger.warn({ event: "auth:role_denied", message: "Non-employee denied /app access" });
    redirect("/unauthorized");
  }

  return profile;
}
