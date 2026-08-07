"use server";

import { revalidatePath } from "next/cache";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { addCommentSchema } from "@/features/tickets/schemas/comment";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type AddAdminCommentActionResult = {
  error?: string;
};

/**
 * Adds a comment as an admin, exclusively through the existing
 * `public.add_ticket_comment` RPC — no admin-specific comment RPC exists
 * or is needed, since that function already permits any admin caller via
 * its own `public.can_access_ticket()` (`is_admin()` branch) check, and
 * always attributes the comment to `auth.user_id()` itself. Never a direct
 * `.insert()`.
 *
 * requireAdmin() runs first, unconditionally — the same defense-in-depth
 * ordering as every other admin Server Action in this app (see
 * update-admin-ticket-status.ts for the fuller rationale). ticketId and
 * message are the only two inputs this action reads, both re-validated
 * with the exact same Zod schemas the employee action uses
 * (ticketIdSchema, addCommentSchema) regardless of what the client already
 * checked; nothing else on the FormData — no role/adminId/actorId/
 * updatedBy — is ever read or forwarded. The RPC alone determines the
 * actual author via auth.user_id().
 */
export async function addAdminTicketCommentAction(
  ticketId: string,
  formData: FormData
): Promise<AddAdminCommentActionResult> {
  await requireAdmin();

  const idResult = ticketIdSchema.safeParse(ticketId);
  if (!idResult.success) {
    return { error: getTicketErrorMessage("comment") };
  }

  const parsed = addCommentSchema.safeParse({ message: formData.get("message") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? getTicketErrorMessage("comment") };
  }

  const client = createDataApiClient();
  const { error } = await client.rpc("add_ticket_comment", {
    p_ticket_id: idResult.data,
    p_message: parsed.data.message,
  });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "admin_tickets:comment_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return { error: getTicketErrorMessage("comment") };
  }

  // Comment-only mutation — the admin registry (/admin/tickets) shows no
  // comment data, so unlike the status/priority/assignee/due-at actions
  // there is nothing there to revalidate.
  revalidatePath(`/admin/tickets/${idResult.data}`);
  return {};
}
