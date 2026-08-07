import { describe, expect, it } from "vitest";

import { bucketAdminDashboardCounts } from "@/features/tickets/utils/admin-dashboard-counts";

describe("bucketAdminDashboardCounts", () => {
  it("counts every row toward total regardless of status", () => {
    const result = bucketAdminDashboardCounts([
      { status: "new", assigneeId: "p1" },
      { status: "closed", assigneeId: "p2" },
    ]);
    expect(result.total).toBe(2);
  });

  it("counts a null assignee_id as unassigned", () => {
    const result = bucketAdminDashboardCounts([
      { status: "new", assigneeId: null },
      { status: "new", assigneeId: "p1" },
    ]);
    expect(result.unassigned).toBe(1);
  });

  it("buckets in_progress on its own", () => {
    const result = bucketAdminDashboardCounts([
      { status: "in_progress", assigneeId: "p1" },
      { status: "in_progress", assigneeId: "p2" },
      { status: "new", assigneeId: "p1" },
    ]);
    expect(result.inProgress).toBe(2);
  });

  it("buckets resolved, closed, and cancelled into done", () => {
    const result = bucketAdminDashboardCounts([
      { status: "resolved", assigneeId: "p1" },
      { status: "closed", assigneeId: "p1" },
      { status: "cancelled", assigneeId: "p1" },
    ]);
    expect(result.done).toBe(3);
  });

  it("does not count new/accepted/waiting toward in_progress or done", () => {
    const result = bucketAdminDashboardCounts([
      { status: "new", assigneeId: "p1" },
      { status: "accepted", assigneeId: "p1" },
      { status: "waiting", assigneeId: "p1" },
    ]);
    expect(result.inProgress).toBe(0);
    expect(result.done).toBe(0);
  });

  it("returns all zeros for no tickets", () => {
    expect(bucketAdminDashboardCounts([])).toEqual({
      total: 0,
      unassigned: 0,
      inProgress: 0,
      done: 0,
    });
  });

  it("handles a realistic mix across statuses and assignment", () => {
    const result = bucketAdminDashboardCounts([
      { status: "new", assigneeId: null },
      { status: "accepted", assigneeId: "p1" },
      { status: "in_progress", assigneeId: "p1" },
      { status: "waiting", assigneeId: null },
      { status: "resolved", assigneeId: "p2" },
      { status: "closed", assigneeId: "p2" },
      { status: "cancelled", assigneeId: null },
    ]);
    expect(result).toEqual({ total: 7, unassigned: 3, inProgress: 1, done: 3 });
  });
});
