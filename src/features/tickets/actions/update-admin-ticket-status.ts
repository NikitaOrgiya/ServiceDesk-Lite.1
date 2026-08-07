"use server";

import { revalidatePath } from "next/cache";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { adminSetTicketStatusSchema } from "@/features/tickets/schemas/admin-ticket-mutation";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";
import { mapAdminMutationErrorCode } from "@/features/tickets/utils/admin-mutation-error";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type UpdateAdminTicketStatusResult = {
  error?: string;
};

/**
 * Changes a ticket's status exclusively through
 * `public.admin_set_ticket_status` (SECURITY DEFINER, re-checks
 * auth.user_id()/public.is_admin() itself — see
 * drizzle/0004_comment_and_mutation_rpcs.sql) — never a direct `.update()`.
 *
 * requireAdmin() runs first, unconditionally, before FormData is even read
 * — the same defense-in-depth ordering as every other admin data-access
 * function in this app (see get-admin-ticket.ts, get-admin-tickets.ts).
 * `ticketId`/`status` are the only two fields this action reads off the
 * FormData, both re-validated with Zod regardless of what the client's
 * <select> already restricted itself to, and neither one — nor anything
 * else on the FormData — ever participates in authorization. The RPC
 * itself is the sole writer of `updated_at`/`updated_by` (stamped from
 * auth.user_id(), never a client-supplied actor id), status-transition
 * legality (public.is_valid_ticket_status_transition()), resolved_at
 * bookkeeping, and the ticket_history row — this action does none of that
 * itself and never writes to ticket_history directly.
 */
export async function updateAdminTicketStatusAction(
  formData: FormData
): Promise<UpdateAdminTicketStatusResult> {
  await requireAdmin();

  const idResult = ticketIdSchema.safeParse(formData.get("ticketId"));
  const statusResult = adminSetTicketStatusSchema.safeParse({ status: formData.get("status") });

  if (!idResult.success || !statusResult.success) {
    return { error: getTicketErrorMessage("adminUpdateStatus") };
  }

  const client = createDataApiClient();
  const { error } = await client.rpc("admin_set_ticket_status", {
    p_ticket_id: idResult.data,
    p_status: statusResult.data.status,
  });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "admin_tickets:status_update_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return {
      error: mapAdminMutationErrorCode(
        sanitized.code,
        getTicketErrorMessage("adminUpdateStatus"),
        getTicketErrorMessage("adminInvalidStatusTransition")
      ),
    };
  }

  revalidatePath(`/admin/tickets/${idResult.data}`);
  revalidatePath("/admin/tickets");
  return {};
}
