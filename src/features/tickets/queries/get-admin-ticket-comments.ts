import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";
import { toSingleEmbed } from "@/features/tickets/utils/postgrest-embed";
import type { TicketCommentItem } from "@/features/tickets/types/ticket";

/**
 * Loads every comment on one ticket, oldest first — read-only, admin-only.
 * Duplicates getTicketComments's query/mapping (get-employee-ticket.ts)
 * rather than sharing it, for the same reason get-admin-ticket.ts
 * duplicates the ticket-row mapping: each admin data-access function's
 * authorization boundary must be self-contained and independently
 * auditable, not entangled with the employee query's own boundary.
 *
 * requireAdmin() runs first, unconditionally, before the ticket id is even
 * validated or the Data API client created — same ordering as every other
 * admin data-access function in this app. `ticket_comments_select_accessible`
 * RLS (drizzle/0005_rls_policies.sql, via can_access_ticket()'s is_admin()
 * branch) is what actually widens visibility to every ticket's comments for
 * an admin JWT; requireAdmin() here is the application-level gate in front
 * of that, not a substitute for it.
 *
 * An invalid ticket id or a Data API error both resolve to an empty list
 * (never thrown) — this function is read alongside getAdminTicketDetail()
 * via Promise.all on the same page, and must never let its own failure
 * masquerade as "the ticket doesn't exist" (only getAdminTicketDetail()
 * returning null does that).
 */
export async function getAdminTicketComments(ticketId: string): Promise<TicketCommentItem[]> {
  await requireAdmin();

  const idResult = ticketIdSchema.safeParse(ticketId);
  if (!idResult.success) {
    return [];
  }

  const client = createDataApiClient();

  const { data, error } = await client
    .from("ticket_comments")
    .select(
      "id, message, created_at, author:profiles!ticket_comments_author_id_profiles_id_fk(full_name, role)"
    )
    .eq("ticket_id", idResult.data)
    .order("created_at", { ascending: true });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "admin_tickets:comments_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return [];
  }

  type CommentAuthor = { full_name: string; role: "employee" | "admin" };

  return (data ?? []).map((row) => {
    const author = toSingleEmbed(row.author as CommentAuthor | CommentAuthor[] | null);
    return {
      id: row.id as string,
      message: row.message as string,
      createdAt: row.created_at as string,
      authorName: author?.full_name ?? "—",
      authorRole: author?.role ?? "employee",
    };
  });
}
