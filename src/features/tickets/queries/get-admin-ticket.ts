import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";
import { toSingleEmbed } from "@/features/tickets/utils/postgrest-embed";
import type { TicketCategory, TicketPriority } from "@/features/tickets/schemas/create-ticket";
import type { AdminTicketDetail, TicketStatus } from "@/features/tickets/types/ticket";

/**
 * Loads one ticket for the admin ticket detail route (src/app/admin/tickets/[id])
 * — read-only, single-row, no comments/history/mutations (out of scope for
 * this PR). Mirrors the ticket-row half of getEmployeeTicketDetail (see
 * get-employee-ticket.ts), duplicated rather than shared for the same reason
 * getAdminTickets()/getEmployeeTickets() don't share code: each function's
 * authorization boundary must be self-contained and independently auditable.
 *
 * requireAdmin() is called first, unconditionally, and awaited before the
 * Data API client is created or the ticket SELECT runs — this re-verifies
 * authorization from public.profiles.role independently of the /admin
 * layout's own requireAdmin() call (same defense-in-depth shape as
 * getAdminTickets() in get-admin-tickets.ts). tickets_select_own_or_admin
 * RLS (drizzle/0005_rls_policies.sql) is what actually widens visibility to
 * every ticket for an admin JWT; requireAdmin() here is not a substitute
 * for that policy, it's the application-level gate in front of it. Neither
 * check ever trusts a caller-supplied role or id — only public.profiles.role
 * via requireAdmin(), and the route's ticket id is used solely to select a
 * row, never to authorize.
 *
 * Returns null for both "no such ticket" and "ticket exists but the SELECT
 * failed" — see getEmployeeTicketDetail's own doc comment for why callers
 * must not try to distinguish those two cases either (both must render as
 * plain not-found to the caller).
 *
 * Also selects the raw `assignee_id` column (alongside the existing
 * `assignee` name embed) — the technical id an admin mutation form needs to
 * identify the *current* assignee unambiguously (two profiles can share the
 * same full_name), returned only as AdminTicketDetail.assigneeId, a plain
 * data field never rendered as visible text by any caller.
 */
export async function getAdminTicketDetail(ticketId: string): Promise<AdminTicketDetail | null> {
  await requireAdmin();

  const client = createDataApiClient();

  const { data: ticketRow, error } = await client
    .from("tickets")
    .select(
      `id, public_number, title, description, category, priority, status, due_at, resolved_at, created_at, updated_at, assignee_id,
       author:profiles!tickets_author_id_profiles_id_fk(full_name),
       assignee:profiles!tickets_assignee_id_profiles_id_fk(full_name)`
    )
    .eq("id", ticketId)
    .maybeSingle();

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "admin_tickets:detail_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return null;
  }

  if (!ticketRow) {
    return null;
  }

  const author = toSingleEmbed(ticketRow.author as { full_name: string } | { full_name: string }[] | null);
  const assignee = toSingleEmbed(
    ticketRow.assignee as { full_name: string } | { full_name: string }[] | null
  );

  return {
    id: ticketRow.id as string,
    publicNumber: ticketRow.public_number as string,
    title: ticketRow.title as string,
    description: ticketRow.description as string,
    category: ticketRow.category as TicketCategory,
    priority: ticketRow.priority as TicketPriority,
    status: ticketRow.status as TicketStatus,
    dueAt: ticketRow.due_at as string | null,
    resolvedAt: ticketRow.resolved_at as string | null,
    createdAt: ticketRow.created_at as string,
    updatedAt: ticketRow.updated_at as string,
    authorName: author?.full_name ?? "—",
    assigneeName: assignee?.full_name ?? null,
    assigneeId: (ticketRow.assignee_id as string | null) ?? null,
  };
}
