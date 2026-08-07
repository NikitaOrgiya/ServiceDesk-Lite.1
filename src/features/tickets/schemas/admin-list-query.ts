import { z } from "zod";

/**
 * Pagination-only for the admin ticket registry — deliberately no q/status/
 * priority/assignee/sort params yet (search and filters are a later PR).
 * Same "never throw on garbage input" shape as ticketListQuerySchema: an
 * invalid `?page=drop%20table` falls back to page 1 instead of erroring.
 */
export const adminTicketListQuerySchema = z.object({
  page: z
    .preprocess((value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    }, z.number().int().positive())
    .catch(1),
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
