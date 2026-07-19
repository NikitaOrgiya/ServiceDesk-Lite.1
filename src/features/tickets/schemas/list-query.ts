import { z } from "zod";

import { TICKET_STATUSES } from "@/features/tickets/types/ticket";

export const TICKET_LIST_SORTS = ["newest", "oldest"] as const;
export type TicketListSort = (typeof TICKET_LIST_SORTS)[number];

export const TICKET_LIST_PAGE_SIZES = [10, 20, 50] as const;
export type TicketListPageSize = (typeof TICKET_LIST_PAGE_SIZES)[number];

export const TICKET_LIST_STATUS_FILTERS = ["all", ...TICKET_STATUSES] as const;
export type TicketListStatusFilter = (typeof TICKET_LIST_STATUS_FILTERS)[number];

const MAX_SEARCH_LENGTH = 120;

/**
 * Turns an arbitrary `URLSearchParams`-shaped value (all strings, any of
 * them possibly missing or garbage) into safe, whitelisted values. Every
 * field falls back to a sane default via `.catch()` instead of throwing —
 * an invalid `?page=drop%20table` or `?sort=whatever` must never reach the
 * database as an error, and `sort`/`pageSize` are closed enums so no
 * caller-supplied column name or arbitrary page size can reach the query
 * builder.
 */
export const ticketListQuerySchema = z.object({
  q: z.string().trim().max(MAX_SEARCH_LENGTH).catch(""),
  status: z.enum(TICKET_LIST_STATUS_FILTERS).catch("all"),
  sort: z.enum(TICKET_LIST_SORTS).catch("newest"),
  page: z
    .preprocess((value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    }, z.number().int().positive())
    .catch(1),
  pageSize: z
    .preprocess((value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    }, z.union([z.literal(10), z.literal(20), z.literal(50)]))
    .catch(10),
});

export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

/** Applies the schema's own defaults/catches to a raw searchParams record. */
export function parseTicketListQuery(
  raw: Record<string, string | string[] | undefined>
): TicketListQuery {
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  );
  return ticketListQuerySchema.parse(flat);
}
