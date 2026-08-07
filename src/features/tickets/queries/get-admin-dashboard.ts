import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";
import { bucketAdminDashboardCounts } from "@/features/tickets/utils/admin-dashboard-counts";
import type { AdminDashboardCounts, TicketStatus } from "@/features/tickets/types/ticket";

/**
 * Buckets every ticket visible to the caller into the admin dashboard
 * counters from a single `status, assignee_id` read — not N separate
 * `count()` queries, mirroring getEmployeeDashboardCounts()'s own
 * established shape (get-employee-dashboard.ts). `tickets_select_own_or_
 * admin` RLS (drizzle/0005_rls_policies.sql) is what actually widens the
 * read to every ticket for an admin JWT, not just the caller's own — no
 * client-supplied user id or filter is ever part of this query.
 *
 * requireAdmin() runs first, unconditionally, before the Data API client
 * is created — same defense-in-depth ordering as every other admin
 * data-access function in this app. Read-only: no RPC, no write.
 */
export async function getAdminDashboardCounts(): Promise<AdminDashboardCounts | null> {
  await requireAdmin();

  const client = createDataApiClient();

  const { data, error } = await client.from("tickets").select("status, assignee_id");

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "admin_tickets:dashboard_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return null;
  }

  return bucketAdminDashboardCounts(
    (data ?? []).map((row) => ({
      status: row.status as TicketStatus,
      assigneeId: row.assignee_id as string | null,
    }))
  );
}
