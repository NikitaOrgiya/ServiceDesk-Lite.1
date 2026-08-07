import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireEmployee } from "@/features/auth/server/require-employee";
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
 *
 * requireEmployee() runs first, unconditionally, before the Data API
 * client is created — an independent defense-in-depth boundary matching
 * every admin data-access function's own requireAdmin() call, rather than
 * relying solely on the `/app` layout's own requireEmployee() call and RLS
 * to have already scoped the caller.
 */
export async function getEmployeeDashboardCounts(): Promise<EmployeeDashboardCounts | null> {
  await requireEmployee();

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
