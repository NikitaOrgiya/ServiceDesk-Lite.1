"use server";

import { revalidatePath } from "next/cache";

import { createDataApiClient } from "@/lib/neon/data-api";
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
 * `public.cancel_own_ticket` (called via the Neon Data API's RPC
 * endpoint). Hiding the cancel button once status is no longer 'new' is
 * only a UX nicety on the client — the real protection is the RPC's own
 * `WHERE author_id = auth.user_id() AND status = 'new'` check, which this
 * function relies on rather than duplicating client-side.
 *
 * requireEmployee() runs first, unconditionally, before ticketId is even
 * validated — the project-wide invariant (auth -> validation -> Data
 * API/RPC), matching every admin action's own requireAdmin()-first
 * ordering.
 */
export async function cancelTicketAction(ticketId: string): Promise<CancelTicketActionResult> {
  await requireEmployee(`/app/tickets/${ticketId}`);

  const idResult = ticketIdSchema.safeParse(ticketId);
  if (!idResult.success) {
    return { error: getTicketErrorMessage("cancel") };
  }

  const client = createDataApiClient();
  const { error } = await client.rpc("cancel_own_ticket", { p_ticket_id: idResult.data });

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
