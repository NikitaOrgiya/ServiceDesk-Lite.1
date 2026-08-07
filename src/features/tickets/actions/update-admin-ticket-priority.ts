"use server";

import { revalidatePath } from "next/cache";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { adminSetTicketPrioritySchema } from "@/features/tickets/schemas/admin-ticket-mutation";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";
import { mapAdminMutationErrorCode } from "@/features/tickets/utils/admin-mutation-error";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type UpdateAdminTicketPriorityResult = {
  error?: string;
};

/**
 * Changes a ticket's priority exclusively through
 * `public.admin_set_ticket_priority` (SECURITY DEFINER, re-checks
 * auth.user_id()/public.is_admin() itself — see
 * drizzle/0004_comment_and_mutation_rpcs.sql) — never a direct `.update()`.
 * Same shape and ordering as updateAdminTicketStatusAction (see that
 * file's doc comment for the full defense-in-depth rationale); kept as a
 * fully separate Server Action/RPC pair rather than combined with the
 * status mutation so that one succeeding while the other fails can never
 * produce a partial, inconsistent write.
 */
export async function updateAdminTicketPriorityAction(
  formData: FormData
): Promise<UpdateAdminTicketPriorityResult> {
  await requireAdmin();

  const idResult = ticketIdSchema.safeParse(formData.get("ticketId"));
  const priorityResult = adminSetTicketPrioritySchema.safeParse({
    priority: formData.get("priority"),
  });

  if (!idResult.success || !priorityResult.success) {
    return { error: getTicketErrorMessage("adminUpdatePriority") };
  }

  const client = createDataApiClient();
  const { error } = await client.rpc("admin_set_ticket_priority", {
    p_ticket_id: idResult.data,
    p_priority: priorityResult.data.priority,
  });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "admin_tickets:priority_update_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return {
      error: mapAdminMutationErrorCode(sanitized.code, getTicketErrorMessage("adminUpdatePriority")),
    };
  }

  revalidatePath(`/admin/tickets/${idResult.data}`);
  revalidatePath("/admin/tickets");
  return {};
}
