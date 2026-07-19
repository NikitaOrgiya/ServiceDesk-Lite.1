import "server-only";
import { redirect } from "next/navigation";

import { resolveRedirectTarget } from "@/features/auth/redirect";
import type { UserRole } from "@/features/auth/roles";

/**
 * Sends a signed-in user to their role's section (or a sanitized `next`
 * target within it). The single call site used after login and from
 * `/login` itself when an already-authenticated user opens it — see
 * src/features/auth/redirect.ts for the pure, unit-tested resolution
 * logic this wraps.
 */
export function redirectByRole(role: UserRole, next?: string | null): never {
  redirect(resolveRedirectTarget(role, next));
}
