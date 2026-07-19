import { describe, expect, it } from "vitest";

import { bucketDashboardCounts } from "@/features/tickets/utils/dashboard-counts";

describe("bucketDashboardCounts", () => {
  it("buckets new and accepted into 'open'", () => {
    expect(bucketDashboardCounts(["new", "accepted", "new"])).toEqual({
      open: 3,
      inProgress: 0,
      waiting: 0,
      done: 0,
    });
  });

  it("buckets resolved, closed, and cancelled into 'done'", () => {
    expect(bucketDashboardCounts(["resolved", "closed", "cancelled"])).toEqual({
      open: 0,
      inProgress: 0,
      waiting: 0,
      done: 3,
    });
  });

  it("counts in_progress and waiting on their own", () => {
    expect(bucketDashboardCounts(["in_progress", "in_progress", "waiting"])).toEqual({
      open: 0,
      inProgress: 2,
      waiting: 1,
      done: 0,
    });
  });

  it("returns all zeros for no tickets", () => {
    expect(bucketDashboardCounts([])).toEqual({ open: 0, inProgress: 0, waiting: 0, done: 0 });
  });

  it("handles a realistic mix across all four buckets", () => {
    expect(
      bucketDashboardCounts([
        "new",
        "accepted",
        "in_progress",
        "waiting",
        "resolved",
        "closed",
        "cancelled",
      ])
    ).toEqual({ open: 2, inProgress: 1, waiting: 1, done: 3 });
  });
});
