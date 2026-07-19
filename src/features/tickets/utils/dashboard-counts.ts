import type { EmployeeDashboardCounts, TicketStatus } from "@/features/tickets/types/ticket";

const OPEN_STATUSES: readonly TicketStatus[] = ["new", "accepted"];
const DONE_STATUSES: readonly TicketStatus[] = ["resolved", "closed", "cancelled"];

/** Pure bucketing logic, kept separate from the Supabase query itself so it
 * can be unit tested without pulling in `server-only`/env-dependent code. */
export function bucketDashboardCounts(statuses: readonly TicketStatus[]): EmployeeDashboardCounts {
  const counts: EmployeeDashboardCounts = { open: 0, inProgress: 0, waiting: 0, done: 0 };

  for (const status of statuses) {
    if (OPEN_STATUSES.includes(status)) {
      counts.open += 1;
    } else if (status === "in_progress") {
      counts.inProgress += 1;
    } else if (status === "waiting") {
      counts.waiting += 1;
    } else if (DONE_STATUSES.includes(status)) {
      counts.done += 1;
    }
  }

  return counts;
}
