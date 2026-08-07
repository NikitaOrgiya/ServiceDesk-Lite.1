import type { AdminDashboardCounts, TicketStatus } from "@/features/tickets/types/ticket";

const DONE_STATUSES: readonly TicketStatus[] = ["resolved", "closed", "cancelled"];

export type AdminDashboardRow = {
  status: TicketStatus;
  assigneeId: string | null;
};

/**
 * Pure bucketing logic, mirroring bucketDashboardCounts (dashboard-counts.ts)
 * — kept separate from the query itself so it's unit-testable without
 * pulling in server-only/env-dependent code. "Unassigned" is a plain
 * existing column fact (assignee_id IS NULL, the same concept the registry's
 * own assignee filter already uses), not an invented status.
 */
export function bucketAdminDashboardCounts(
  rows: readonly AdminDashboardRow[]
): AdminDashboardCounts {
  const counts: AdminDashboardCounts = { total: 0, unassigned: 0, inProgress: 0, done: 0 };

  for (const row of rows) {
    counts.total += 1;

    if (row.assigneeId === null) {
      counts.unassigned += 1;
    }

    if (row.status === "in_progress") {
      counts.inProgress += 1;
    } else if (DONE_STATUSES.includes(row.status)) {
      counts.done += 1;
    }
  }

  return counts;
}
