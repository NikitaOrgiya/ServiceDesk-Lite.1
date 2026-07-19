import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";
import { toSingleEmbed } from "@/features/tickets/utils/supabase-embed";
import type { TicketListQuery } from "@/features/tickets/schemas/list-query";
import type { TicketCategory, TicketPriority } from "@/features/tickets/schemas/create-ticket";
import type { TicketListItem, TicketStatus } from "@/features/tickets/types/ticket";

/**
 * PostgREST's `or()`/`and()` filter syntax treats `,`, `(`, `)` and `"` as
 * meta-characters of its own mini filter language — a raw search term
 * containing them could otherwise inject extra filter clauses into the
 * request. Wrapping the value in a double-quoted PostgREST string (and
 * escaping any embedded backslash/quote) makes it opaque to that parser.
 * This is unrelated to SQL: the Supabase query builder is doing the actual
 * SQL parameterization, this only sanitizes the filter-string argument we
 * hand to it — there is no manual SQL string concatenation anywhere here.
 */
function escapePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export type EmployeeTicketsResult = {
  items: TicketListItem[];
  total: number;
};

/**
 * Paginated list of the caller's own tickets. Search/filter/sort all come
 * from the already-whitelisted `TicketListQuery` (see schemas/list-query.ts)
 * — `sort` and `pageSize` are closed enums, so no caller-supplied column
 * name or page size ever reaches `.order()`/`.range()`. The assignee name
 * is embedded in this same query (one round trip for the whole page, not
 * one profile lookup per row).
 */
export async function getEmployeeTickets(
  query: TicketListQuery
): Promise<EmployeeTicketsResult | null> {
  const supabase = await createClient();

  let builder = supabase
    .from("tickets")
    .select(
      "id, public_number, title, category, priority, status, created_at, assignee:profiles!tickets_assignee_id_fkey(full_name)",
      { count: "exact" }
    );

  if (query.status !== "all") {
    builder = builder.eq("status", query.status);
  }

  if (query.q.length > 0) {
    const pattern = escapePostgrestValue(`%${query.q}%`);
    builder = builder.or(`public_number.ilike.${pattern},title.ilike.${pattern}`);
  }

  builder = builder.order("created_at", { ascending: query.sort === "oldest" });

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  const { data, error, count } = await builder.range(from, to);

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "tickets:list_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return null;
  }

  const items: TicketListItem[] = (data ?? []).map((row) => {
    const assignee = toSingleEmbed(row.assignee as { full_name: string } | { full_name: string }[] | null);
    return {
      id: row.id as string,
      publicNumber: row.public_number as string,
      title: row.title as string,
      category: row.category as TicketCategory,
      priority: row.priority as TicketPriority,
      status: row.status as TicketStatus,
      createdAt: row.created_at as string,
      assigneeName: assignee?.full_name ?? null,
    };
  });

  return { items, total: count ?? 0 };
}
