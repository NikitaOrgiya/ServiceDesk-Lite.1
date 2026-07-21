import "server-only";
import { z } from "zod";

import { createDataApiClient } from "@/lib/neon/data-api";
import { getCurrentUser } from "@/features/auth/server/get-current-user";
import { USER_ROLES } from "@/features/auth/roles";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

// Runtime boundary validation for the raw Data API row — see the same note
// in src/db/types.ts about not conflating Drizzle's own inferred types
// (server-side schema source of truth) with an external HTTP response shape.
const profileRowSchema = z.object({
  id: z.string(),
  full_name: z.string(),
  role: z.enum(USER_ROLES),
  department: z.string().nullable(),
  is_active: z.boolean(),
});

export type CurrentProfile = {
  id: string;
  fullName: string;
  role: (typeof USER_ROLES)[number];
  department: string | null;
  isActive: boolean;
};

/**
 * Loads the caller's own profile from `public.profiles` via the Neon Data
 * API (RLS-scoped to the caller's own row, or all rows for an admin — see
 * drizzle/0009_profile_visibility_for_related_tickets.sql) — the only
 * source of truth for `role` and `is_active`. Never derives either from a
 * query parameter or a cookie the application itself set.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const client = createDataApiClient();
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, role, department, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "auth:profile_lookup_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return null;
  }

  if (!data) {
    logger.warn({
      event: "auth:profile_missing",
      message: "Authenticated user has no profiles row",
    });
    return null;
  }

  const parsed = profileRowSchema.safeParse(data);
  if (!parsed.success) {
    logger.error({
      event: "auth:profile_lookup_failed",
      message: "Profile row failed shape validation",
    });
    return null;
  }

  return {
    id: parsed.data.id,
    fullName: parsed.data.full_name,
    role: parsed.data.role,
    department: parsed.data.department,
    isActive: parsed.data.is_active,
  };
}
