"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { newPasswordSchema } from "@/features/auth/schema";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type UpdatePasswordResult = {
  error: string;
};

const GENERIC_UPDATE_ERROR = "Не удалось обновить пароль. Попробуйте запросить ссылку ещё раз.";

/**
 * Requires an active recovery session already established by
 * /auth/callback exchanging the code Supabase emailed — this action does
 * not implement its own reset-token scheme. Never logs the password
 * itself, only the sanitized Supabase error (if any).
 */
export async function updatePasswordAction(input: unknown): Promise<UpdatePasswordResult> {
  const parsed = newPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_UPDATE_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.warn({
      event: "auth:password_update_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return { error: GENERIC_UPDATE_ERROR };
  }

  redirect("/login");
}
