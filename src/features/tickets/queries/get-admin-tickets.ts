import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";
import { toSingleEmbed } from "@/features/tickets/utils/postgrest-embed";
import type { AdminTicketListQuery } from "@/features/tickets/schemas/admin-list-query";
import type { TicketPriority } from "@/features/tickets/schemas/create-ticket";
import type { AdminTicketListItem, TicketStatus } from "@/features/tickets/types/ticket";

export const ADMIN_TICKET_PAGE_SIZE = 20;

export type AdminTicketsResult = {
  items: AdminTicketListItem[];
  total: number;
};

/**
 * Read-only, paginated view of every ticket visible to the caller — never
 * calls .insert()/.update()/.delete()/.rpc(): this is the admin ticket
 * registry, and mutation is out of scope for this feature entirely (see
 * the admin_set_ticket_* RPCs for the separate, later mutation surface).
 *
 * requireAdmin() is called first, unconditionally, and awaited before any
 * ticket query runs: a privileged admin-wide read like this must not rely
 * on its caller (src/app/admin/tickets/page.tsx, itself already gated by
 * the /admin layout's own requireAdmin() call) to have checked authorization
 * — this data-access function re-verifies it independently, from
 * public.profiles.role only, exactly like every other requireAdmin() call
 * site in this app. requireAdmin() redirects (throws Next's internal
 * redirect signal) rather than returning a value on failure, so an
 * unauthenticated or non-admin caller never reaches the query below at
 * all — there is no code path here that runs the SELECT first and checks
 * authorization after.
 *
 * Once past that check, the same JWT is what createDataApiClient() uses:
 * tickets_select_own_or_admin (drizzle/0005_rls_policies.sql) is what
 * actually grants "every ticket" instead of "my own tickets" for that JWT,
 * and profiles_select_own_admin_or_related (drizzle/0009) is what allows
 * the requester/assignee name embeds below to resolve for profiles other
 * than the caller's own. RLS is defense in depth here, not a substitute
 * for the requireAdmin() check above — this function trusts neither a
 * caller-supplied role/id (there is no such parameter) nor Neon Auth's own
 * internal admin concept, only public.profiles.role.
 *
 * Sort is deterministic: newest first, with id as a stable tie-breaker for
 * rows sharing the same created_at timestamp, so pagination never
 * reshuffles rows between requests (unlike relying on Postgres's
 * unspecified default order).
 */
export async function getAdminTickets(query: AdminTicketListQuery): Promise<AdminTicketsResult | null> {
  await requireAdmin();

  const client = createDataApiClient();

  const from = (query.page - 1) * ADMIN_TICKET_PAGE_SIZE;
  const to = from + ADMIN_TICKET_PAGE_SIZE - 1;

  const { data, error, count } = await client
    .from("tickets")
    .select(
      "id, public_number, title, priority, status, created_at, due_at, requester:profiles!tickets_author_id_profiles_id_fk(full_name), assignee:profiles!tickets_assignee_id_profiles_id_fk(full_name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "admin_tickets:list_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return null;
  }

  const items: AdminTicketListItem[] = (data ?? []).map((row) => {
    const requester = toSingleEmbed(row.requester as { full_name: string } | { full_name: string }[] | null);
    const assignee = toSingleEmbed(row.assignee as { full_name: string } | { full_name: string }[] | null);
    return {
      id: row.id as string,
      publicNumber: row.public_number as string,
      title: row.title as string,
      priority: row.priority as TicketPriority,
      status: row.status as TicketStatus,
      requesterName: requester?.full_name ?? "—",
      assigneeName: assignee?.full_name ?? null,
      createdAt: row.created_at as string,
      dueAt: (row.due_at as string | null) ?? null,
    };
  });

  return { items, total: count ?? 0 };
}
