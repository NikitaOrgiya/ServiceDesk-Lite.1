"use server";

import { revalidatePath } from "next/cache";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { adminSetTicketAssigneeSchema } from "@/features/tickets/schemas/admin-ticket-mutation";
import { ADMIN_TICKET_UNASSIGNED } from "@/features/tickets/schemas/admin-list-query";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";
import { mapAdminMutationErrorCode } from "@/features/tickets/utils/admin-mutation-error";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type UpdateAdminTicketAssigneeResult = {
  error?: string;
};

/**
 * Changes a ticket's assignee exclusively through
 * `public.admin_set_ticket_assignee` (SECURITY DEFINER, re-checks
 * auth.user_id()/public.is_admin() itself, and independently verifies the
 * target profile exists and is active before accepting it — see
 * drizzle/0004_comment_and_mutation_rpcs.sql) — never a direct `.update()`.
 * Same shape and ordering as updateAdminTicketStatusAction (see that
 * file's doc comment for the full defense-in-depth rationale).
 *
 * `assignee` reuses ADMIN_TICKET_UNASSIGNED (schemas/admin-list-query.ts —
 * the same sentinel the registry's assignee *filter* already uses) as the
 * client-facing "no assignee" value; the mapping to the RPC's actual NULL
 * happens here, server-side, after Zod validation, never trusted directly
 * off the client. The assignee id itself is only ever a mutation target,
 * never authorization input — this action does not, and must not, assume
 * it is well-formed beyond a bounded length (see the schema's own comment
 * on why it isn't validated as a UUID), and it is the RPC alone that
 * authoritatively verifies the id names a real, currently-active profile.
 */
export async function updateAdminTicketAssigneeAction(
  formData: FormData
): Promise<UpdateAdminTicketAssigneeResult> {
  await requireAdmin();

  const idResult = ticketIdSchema.safeParse(formData.get("ticketId"));
  const assigneeResult = adminSetTicketAssigneeSchema.safeParse({
    assignee: formData.get("assignee"),
  });

  if (!idResult.success || !assigneeResult.success) {
    return { error: getTicketErrorMessage("adminUpdateAssignee") };
  }

  const assigneeId =
    assigneeResult.data.assignee === ADMIN_TICKET_UNASSIGNED ? null : assigneeResult.data.assignee;

  const client = createDataApiClient();
  const { error } = await client.rpc("admin_set_ticket_assignee", {
    p_ticket_id: idResult.data,
    p_assignee_id: assigneeId,
  });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "admin_tickets:assignee_update_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return {
      error: mapAdminMutationErrorCode(
        sanitized.code,
        getTicketErrorMessage("adminUpdateAssignee"),
        getTicketErrorMessage("adminUpdateAssignee"),
        { "23514": getTicketErrorMessage("adminAssigneeUnavailable") }
      ),
    };
  }

  revalidatePath(`/admin/tickets/${idResult.data}`);
  revalidatePath("/admin/tickets");
  return {};
}
