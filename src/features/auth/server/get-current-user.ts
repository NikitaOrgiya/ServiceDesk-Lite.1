import "server-only";

import { auth } from "@/lib/auth/server";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type CurrentUser = {
  id: string;
  email: string | null;
};

/**
 * Resolves the caller's identity via Neon Auth's `auth.getSession()`,
 * which validates the session cookie against the Neon Auth server rather
 * than merely decoding it. Returns only the minimum needed to look up a
 * profile — never the raw session/JWT, and never logged.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { data, error } = await auth.getSession();

  if (error) {
    const sanitized = sanitizeError(error);
    logger.warn({
      event: "auth:claims_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return null;
  }

  if (!data?.user) {
    return null;
  }

  return { id: data.user.id, email: data.user.email ?? null };
}
