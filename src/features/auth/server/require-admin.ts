import "server-only";
import { redirect } from "next/navigation";

import { requireUser } from "@/features/auth/server/require-user";
import type { CurrentProfile } from "@/features/auth/server/get-current-profile";
import { decideRoleAccess } from "@/features/auth/access-decision";
import { logger } from "@/lib/logger/logger";

/**
 * Requires an active profile with role = 'admin'. An employee visiting an
 * admin route lands on `/unauthorized` — never merely hidden behind a
 * client-side check, and never inferred from a menu item being absent.
 */
export async function requireAdmin(currentPath?: string): Promise<CurrentProfile> {
  const profile = await requireUser(currentPath);

  if (decideRoleAccess(profile.role, "admin") === "deny") {
    logger.warn({ event: "auth:role_denied", message: "Non-admin denied /admin access" });
    redirect("/unauthorized");
  }

  return profile;
}
