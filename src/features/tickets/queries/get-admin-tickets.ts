import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";
import { toSingleEmbed } from "@/features/tickets/utils/postgrest-embed";
import {
  ADMIN_TICKET_PAGE_SIZE,
  ADMIN_TICKET_UNASSIGNED,
  type AdminTicketListQuery,
} from "@/features/tickets/schemas/admin-list-query";
import type { TicketPriority } from "@/features/tickets/schemas/create-ticket";
import type { AdminTicketListItem, TicketStatus } from "@/features/tickets/types/ticket";

export { ADMIN_TICKET_PAGE_SIZE };

/**
 * PostgREST's `or()`/`and()` filter syntax treats `,`, `(`, `)` and `"` as
 * meta-characters of its own mini filter language — a raw search term
 * containing them could otherwise inject extra filter clauses into the
 * request. Wrapping the value in a double-quoted PostgREST string (and
 * escaping any embedded backslash/quote) makes it opaque to that parser.
 * This is unrelated to SQL: the Neon Data API client does the actual SQL
 * parameterization; this only sanitizes the filter-string argument handed
 * to it — there is no manual SQL string concatenation anywhere here.
 * Identical to the same helper in get-employee-tickets.ts.
 */
function escapePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

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
 * Search/status/priority/assignee all come from the already-whitelisted
 * AdminTicketListQuery (see schemas/admin-list-query.ts) — status/priority
 * are closed enums, so no caller-supplied column name or arbitrary value
 * ever reaches `.eq()`. `assignee` is a free-form technical id (there is no
 * fixed, app-controlled id format to validate against) but participates
 * only as a plain `.eq()`/`.is()` filter value on an already RLS-scoped
 * result set — it can only ever narrow which of the caller's *already
 * visible* rows come back, never widen visibility, and an id that matches
 * no real assignee simply yields zero rows rather than an error. `q` is
 * ANDed with every other filter but is itself an OR between ticket number
 * and title (see the `.or()` call below) — deliberately not description:
 * unlike public_number/title, description has no supporting index and is
 * unbounded free text, and the employee registry's own search (get-
 * employee-tickets.ts) never searched it either, for the same reason.
 *
 * Sort is deterministic: newest first, with id as a stable tie-breaker for
 * rows sharing the same created_at timestamp, so pagination never
 * reshuffles rows between requests (unlike relying on Postgres's
 * unspecified default order). Count is always of the *filtered* set, so
 * pagination reflects what the current filters actually match.
 */
export async function getAdminTickets(query: AdminTicketListQuery): Promise<AdminTicketsResult | null> {
  await requireAdmin();

  const client = createDataApiClient();

  let builder = client
    .from("tickets")
    .select(
      "id, public_number, title, priority, status, created_at, due_at, requester:profiles!tickets_author_id_profiles_id_fk(full_name), assignee:profiles!tickets_assignee_id_profiles_id_fk(full_name)",
      { count: "exact" }
    );

  if (query.status !== "all") {
    builder = builder.eq("status", query.status);
  }

  if (query.priority !== "all") {
    builder = builder.eq("priority", query.priority);
  }

  if (query.assignee === ADMIN_TICKET_UNASSIGNED) {
    builder = builder.is("assignee_id", null);
  } else if (query.assignee.length > 0) {
    builder = builder.eq("assignee_id", query.assignee);
  }

  if (query.q.length > 0) {
    const pattern = escapePostgrestValue(`%${query.q}%`);
    builder = builder.or(`public_number.ilike.${pattern},title.ilike.${pattern}`);
  }

  builder = builder.order("created_at", { ascending: false }).order("id", { ascending: true });

  const from = (query.page - 1) * ADMIN_TICKET_PAGE_SIZE;
  const to = from + ADMIN_TICKET_PAGE_SIZE - 1;

  const { data, error, count } = await builder.range(from, to);

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
