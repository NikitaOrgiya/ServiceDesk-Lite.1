"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

/**
 * Server Action for logout. Calls `supabase.auth.signOut()`, which clears
 * the session server-side and instructs `@supabase/ssr` to remove the auth
 * cookies from the response — this is not a client-side localStorage clear,
 * so a browser "back" navigation cannot resurrect protected content, and
 * the next request to `/app` or `/admin` is caught by requireUser().
 */
export async function logoutAction(): Promise<never> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    const sanitized = sanitizeError(error);
    logger.warn({
      event: "auth:logout_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
  }

  redirect("/login");
}
