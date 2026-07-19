"use server";

import { createClient } from "@/lib/supabase/server";
import { passwordResetRequestSchema } from "@/features/auth/schema";
import { getAuthCallbackUrl } from "@/features/auth/urls";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

const NEUTRAL_MESSAGE =
  "Если учётная запись существует, инструкция отправлена на указанный email.";

export type PasswordResetRequestResult = {
  message: string;
};

/**
 * Always returns the same neutral message regardless of whether the email
 * is registered, whether the input even parsed, or whether Supabase itself
 * returned an error — the response must never be usable to check which
 * emails have accounts. Real failures are still logged server-side.
 */
export async function requestPasswordResetAction(input: unknown): Promise<PasswordResetRequestResult> {
  const parsed = passwordResetRequestSchema.safeParse(input);

  if (!parsed.success) {
    return { message: NEUTRAL_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: getAuthCallbackUrl("/reset-password"),
  });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.warn({
      event: "auth:password_reset_request_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
  }

  return { message: NEUTRAL_MESSAGE };
}
