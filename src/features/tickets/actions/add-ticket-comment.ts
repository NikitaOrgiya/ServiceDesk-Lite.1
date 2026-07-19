"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/features/auth/server/require-employee";
import { addCommentSchema } from "@/features/tickets/schemas/comment";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type AddCommentActionResult = {
  error?: string;
};

/**
 * Adds a comment exclusively through `public.add_ticket_comment` — never a
 * direct `.insert()`. The ticket id and message are both re-validated here
 * regardless of what the client already checked.
 */
export async function addTicketCommentAction(
  ticketId: string,
  formData: FormData
): Promise<AddCommentActionResult> {
  const idResult = ticketIdSchema.safeParse(ticketId);
  if (!idResult.success) {
    return { error: getTicketErrorMessage("comment") };
  }

  await requireEmployee(`/app/tickets/${ticketId}`);

  const parsed = addCommentSchema.safeParse({ message: formData.get("message") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? getTicketErrorMessage("comment") };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_ticket_comment", {
    p_ticket_id: idResult.data,
    p_message: parsed.data.message,
  });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "tickets:comment_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return { error: getTicketErrorMessage("comment") };
  }

  revalidatePath(`/app/tickets/${ticketId}`);
  return {};
}
