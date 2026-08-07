"use server";

import { revalidatePath } from "next/cache";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { adminSetTicketDueAtSchema } from "@/features/tickets/schemas/admin-ticket-mutation";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";
import { mapAdminMutationErrorCode } from "@/features/tickets/utils/admin-mutation-error";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type UpdateAdminTicketDueAtResult = {
  error?: string;
};

/**
 * Changes a ticket's due date exclusively through
 * `public.admin_set_ticket_due_at` (SECURITY DEFINER, re-checks
 * auth.user_id()/public.is_admin() itself — see
 * drizzle/0004_comment_and_mutation_rpcs.sql) — never a direct `.update()`.
 * Same shape and ordering as updateAdminTicketStatusAction (see that
 * file's doc comment for the full defense-in-depth rationale).
 *
 * `dueAt` must already be either an absolute ISO instant with an explicit
 * UTC offset, or the empty-string "clear" sentinel — enforced by
 * adminSetTicketDueAtSchema, which rejects a timezone-less datetime
 * string outright rather than letting this action (or the server's own
 * timezone) guess what instant the admin meant. The browser-local <->
 * absolute-instant conversion happens entirely client-side, before this
 * action ever runs — see utils/datetime-local.ts and
 * AdminTicketDueAtForm. No client-supplied timezone is ever treated as
 * authorization data; an offset is only ever part of the timestamp value
 * itself.
 */
export async function updateAdminTicketDueAtAction(
  formData: FormData
): Promise<UpdateAdminTicketDueAtResult> {
  await requireAdmin();

  const idResult = ticketIdSchema.safeParse(formData.get("ticketId"));
  const dueAtResult = adminSetTicketDueAtSchema.safeParse({ dueAt: formData.get("dueAt") });

  if (!idResult.success || !dueAtResult.success) {
    return { error: getTicketErrorMessage("adminUpdateDueAt") };
  }

  const dueAtValue = dueAtResult.data.dueAt === "" ? null : dueAtResult.data.dueAt;

  const client = createDataApiClient();
  const { error } = await client.rpc("admin_set_ticket_due_at", {
    p_ticket_id: idResult.data,
    p_due_at: dueAtValue,
  });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "admin_tickets:due_at_update_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return { error: mapAdminMutationErrorCode(sanitized.code, getTicketErrorMessage("adminUpdateDueAt")) };
  }

  revalidatePath(`/admin/tickets/${idResult.data}`);
  revalidatePath("/admin/tickets");
  return {};
}
