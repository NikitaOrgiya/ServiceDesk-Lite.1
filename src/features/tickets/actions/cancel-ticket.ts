"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/features/auth/server/require-employee";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type CancelTicketActionResult = {
  error?: string;
};

/**
 * Cancels the caller's own ticket exclusively through
 * `public.cancel_own_ticket`. Hiding the cancel button once status is no
 * longer 'new' is only a UX nicety on the client — the real protection is
 * the RPC's own `WHERE author_id = auth.uid() AND status = 'new'` check,
 * which this function relies on rather than duplicating client-side.
 */
export async function cancelTicketAction(ticketId: string): Promise<CancelTicketActionResult> {
  const idResult = ticketIdSchema.safeParse(ticketId);
  if (!idResult.success) {
    return { error: getTicketErrorMessage("cancel") };
  }

  await requireEmployee(`/app/tickets/${ticketId}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_own_ticket", { p_ticket_id: idResult.data });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "tickets:cancel_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return { error: getTicketErrorMessage("cancel") };
  }

  revalidatePath(`/app/tickets/${ticketId}`);
  revalidatePath("/app/tickets");
  revalidatePath("/app");
  return {};
}
