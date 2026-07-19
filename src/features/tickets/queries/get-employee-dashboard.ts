import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";
import { bucketDashboardCounts } from "@/features/tickets/utils/dashboard-counts";
import type { EmployeeDashboardCounts, TicketStatus } from "@/features/tickets/types/ticket";

/**
 * Buckets the caller's own tickets into the four dashboard counters from
 * a single `status` column read — not four separate `count()` queries.
 * RLS (`tickets_select_own_or_admin`) already scopes the read to the
 * caller's own tickets via the Neon Data API client's own JWT; there is no
 * client-supplied user id anywhere in this query.
 */
export async function getEmployeeDashboardCounts(): Promise<EmployeeDashboardCounts | null> {
  const client = createDataApiClient();

  const { data, error } = await client.from("tickets").select("status");

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "tickets:dashboard_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return null;
  }

  return bucketDashboardCounts((data ?? []).map((row) => row.status as TicketStatus));
}
