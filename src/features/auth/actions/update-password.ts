"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";
import { newPasswordSchema } from "@/features/auth/schema";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type UpdatePasswordResult = {
  error: string;
};

const GENERIC_UPDATE_ERROR = "Не удалось обновить пароль. Попробуйте запросить ссылку ещё раз.";

/**
 * Requires the `token` Neon Auth emailed in the password-reset link (read
 * off /reset-password's own search params, not an established session —
 * Better Auth's reset flow does not require a prior sign-in). Never logs
 * the password or token themselves, only the sanitized Neon Auth error
 * (if any).
 */
export async function updatePasswordAction(
  input: unknown,
  token: string | undefined
): Promise<UpdatePasswordResult> {
  const parsed = newPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_UPDATE_ERROR };
  }

  if (!token) {
    return { error: GENERIC_UPDATE_ERROR };
  }

  const { error } = await auth.resetPassword({ newPassword: parsed.data.password, token });

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
