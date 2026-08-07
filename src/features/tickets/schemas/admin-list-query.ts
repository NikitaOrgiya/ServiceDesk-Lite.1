import { z } from "zod";

import { TICKET_STATUSES } from "@/features/tickets/types/ticket";
import { TICKET_PRIORITIES } from "@/features/tickets/schemas/create-ticket";

export const ADMIN_TICKET_STATUS_FILTERS = ["all", ...TICKET_STATUSES] as const;
export type AdminTicketStatusFilter = (typeof ADMIN_TICKET_STATUS_FILTERS)[number];

export const ADMIN_TICKET_PRIORITY_FILTERS = ["all", ...TICKET_PRIORITIES] as const;
export type AdminTicketPriorityFilter = (typeof ADMIN_TICKET_PRIORITY_FILTERS)[number];

/** Sentinel for "assignee_id IS NULL" — never a real profile id. */
export const ADMIN_TICKET_UNASSIGNED = "unassigned" as const;

// Lives here (a plain, server-independent schema module) rather than in
// get-admin-tickets.ts so that UI code needing only the page size (e.g.
// admin-ticket-pagination.tsx, to compute total pages) never has to import
// a "server-only" Data API module transitively just to read a constant.
export const ADMIN_TICKET_PAGE_SIZE = 20;

const MAX_SEARCH_LENGTH = 120;
// Neon Auth user ids are opaque strings, not a fixed-format UUID this app
// controls the shape of — bounded length only, no format assumption.
const MAX_ASSIGNEE_LENGTH = 200;

/**
 * Pagination + search/filters for the admin ticket registry — no ?sort=
 * yet (a later PR); default order stays created_at DESC, id ASC (see
 * get-admin-tickets.ts). Same "never throw on garbage input" shape as
 * ticketListQuerySchema: every field falls back to its default via
 * `.catch()` instead of erroring, and status/priority are closed enums —
 * no caller-supplied value ever reaches `.eq()` except from this
 * whitelist. `assignee` is intentionally *not* validated against real
 * profile ids here (that would require a DB round trip inside a schema
 * parser) — an unrecognized value simply matches zero tickets at the
 * query layer (see get-admin-tickets.ts's file comment for why that's
 * safe, not an authorization concern).
 */
export const adminTicketListQuerySchema = z.object({
  page: z
    .preprocess((value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    }, z.number().int().positive())
    .catch(1),
  q: z.string().trim().max(MAX_SEARCH_LENGTH).catch(""),
  status: z.enum(ADMIN_TICKET_STATUS_FILTERS).catch("all"),
  priority: z.enum(ADMIN_TICKET_PRIORITY_FILTERS).catch("all"),
  // "" = no assignee filter, ADMIN_TICKET_UNASSIGNED = assignee_id IS NULL,
  // anything else = a technical profile id used only as a DB filter value.
  assignee: z.string().trim().max(MAX_ASSIGNEE_LENGTH).catch(""),
});

export type AdminTicketListQuery = z.infer<typeof adminTicketListQuerySchema>;

/** Applies the schema's own defaults/catches to a raw searchParams record. */
export function parseAdminTicketListQuery(
  raw: Record<string, string | string[] | undefined>
): AdminTicketListQuery {
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  );
  return adminTicketListQuerySchema.parse(flat);
}

/** True when any filter (not just pagination) is active — drives the "no results" vs "empty registry" copy. */
export function hasActiveAdminTicketFilters(query: AdminTicketListQuery): boolean {
  return query.q.length > 0 || query.status !== "all" || query.priority !== "all" || query.assignee.length > 0;
}
