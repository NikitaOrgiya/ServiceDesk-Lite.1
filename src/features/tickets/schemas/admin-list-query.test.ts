import { describe, expect, it } from "vitest";

import {
  adminTicketListQuerySchema,
  parseAdminTicketListQuery,
  hasActiveAdminTicketFilters,
  ADMIN_TICKET_UNASSIGNED,
} from "@/features/tickets/schemas/admin-list-query";

describe("adminTicketListQuerySchema — page", () => {
  it("defaults to page 1 when nothing is provided", () => {
    expect(adminTicketListQuerySchema.parse({}).page).toBe(1);
  });

  it("accepts a valid page number", () => {
    expect(adminTicketListQuerySchema.parse({ page: "3" }).page).toBe(3);
  });

  it("falls back to 1 for zero", () => {
    expect(adminTicketListQuerySchema.parse({ page: "0" }).page).toBe(1);
  });

  it("falls back to 1 for a negative page", () => {
    expect(adminTicketListQuerySchema.parse({ page: "-5" }).page).toBe(1);
  });

  it("falls back to 1 for a non-numeric page", () => {
    expect(adminTicketListQuerySchema.parse({ page: "drop table" }).page).toBe(1);
    expect(adminTicketListQuerySchema.parse({ page: "NaN" }).page).toBe(1);
  });

  it("accepts a large but valid page number rather than breaking", () => {
    expect(adminTicketListQuerySchema.parse({ page: "999999" }).page).toBe(999999);
  });

  it("falls back to 1 for a non-integer page", () => {
    expect(adminTicketListQuerySchema.parse({ page: "1.5" }).page).toBe(1);
  });
});

describe("adminTicketListQuerySchema — q (search)", () => {
  it("accepts a valid search term", () => {
    expect(adminTicketListQuerySchema.parse({ q: "printer" }).q).toBe("printer");
  });

  it("trims surrounding whitespace", () => {
    expect(adminTicketListQuerySchema.parse({ q: "  printer  " }).q).toBe("printer");
  });

  it("empty string is the no-filter value", () => {
    expect(adminTicketListQuerySchema.parse({}).q).toBe("");
    expect(adminTicketListQuerySchema.parse({ q: "" }).q).toBe("");
    expect(adminTicketListQuerySchema.parse({ q: "   " }).q).toBe("");
  });

  it("accepts a search term exactly at the length boundary (120)", () => {
    const q = "а".repeat(120);
    expect(adminTicketListQuerySchema.parse({ q }).q).toBe(q);
  });

  it("a too-long search term falls back to empty instead of an unbounded/problematic query", () => {
    const q = "а".repeat(121);
    expect(adminTicketListQuerySchema.parse({ q }).q).toBe("");
  });
});

describe("adminTicketListQuerySchema — status", () => {
  it("defaults to 'all'", () => {
    expect(adminTicketListQuerySchema.parse({}).status).toBe("all");
  });

  it("accepts every real ticket status plus 'all'", () => {
    for (const status of ["all", "new", "accepted", "in_progress", "waiting", "resolved", "closed", "cancelled"]) {
      expect(adminTicketListQuerySchema.parse({ status }).status).toBe(status);
    }
  });

  it("an invalid status safely falls back to 'all' rather than reaching the query as an arbitrary value", () => {
    expect(adminTicketListQuerySchema.parse({ status: "deleted" }).status).toBe("all");
    expect(adminTicketListQuerySchema.parse({ status: "'; DROP TABLE tickets; --" }).status).toBe("all");
  });
});

describe("adminTicketListQuerySchema — priority", () => {
  it("defaults to 'all'", () => {
    expect(adminTicketListQuerySchema.parse({}).priority).toBe("all");
  });

  it("accepts every real ticket priority plus 'all'", () => {
    for (const priority of ["all", "low", "normal", "high", "critical"]) {
      expect(adminTicketListQuerySchema.parse({ priority }).priority).toBe(priority);
    }
  });

  it("an invalid priority safely falls back to 'all'", () => {
    expect(adminTicketListQuerySchema.parse({ priority: "urgent" }).priority).toBe("all");
  });
});

describe("adminTicketListQuerySchema — assignee", () => {
  it("defaults to '' (no filter)", () => {
    expect(adminTicketListQuerySchema.parse({}).assignee).toBe("");
  });

  it("accepts a technical id value untouched", () => {
    expect(adminTicketListQuerySchema.parse({ assignee: "some-profile-id-123" }).assignee).toBe(
      "some-profile-id-123"
    );
  });

  it("accepts the unassigned sentinel", () => {
    expect(adminTicketListQuerySchema.parse({ assignee: ADMIN_TICKET_UNASSIGNED }).assignee).toBe(
      "unassigned"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(adminTicketListQuerySchema.parse({ assignee: "  some-id  " }).assignee).toBe("some-id");
  });

  it("an overly long value falls back to '' instead of reaching the query unbounded", () => {
    const assignee = "x".repeat(201);
    expect(adminTicketListQuerySchema.parse({ assignee }).assignee).toBe("");
  });
});

describe("parseAdminTicketListQuery", () => {
  it("flattens a searchParams-shaped record and applies every default", () => {
    expect(parseAdminTicketListQuery({})).toEqual({
      page: 1,
      q: "",
      status: "all",
      priority: "all",
      assignee: "",
    });
  });

  it("takes the first value when a key was repeated in the URL", () => {
    expect(parseAdminTicketListQuery({ status: ["new", "closed"] }).status).toBe("new");
  });

  it("ignores unknown/unrecognized query params instead of erroring or reflecting them back", () => {
    const result = parseAdminTicketListQuery({
      page: "2",
      q: "printer",
      status: "new",
      priority: "high",
      assignee: "profile-1",
      sort: "unsupported-in-this-pr",
      unknownParam: "anything",
    });
    expect(result).toEqual({ page: 2, q: "printer", status: "new", priority: "high", assignee: "profile-1" });
    expect(result).not.toHaveProperty("sort");
    expect(result).not.toHaveProperty("unknownParam");
  });

  it("parses a fully valid combined query untouched", () => {
    expect(
      parseAdminTicketListQuery({ page: "2", q: "vpn", status: "in_progress", priority: "critical", assignee: "unassigned" })
    ).toEqual({ page: 2, q: "vpn", status: "in_progress", priority: "critical", assignee: "unassigned" });
  });
});

describe("hasActiveAdminTicketFilters", () => {
  it("is false when every field is at its default", () => {
    expect(hasActiveAdminTicketFilters({ page: 5, q: "", status: "all", priority: "all", assignee: "" })).toBe(
      false
    );
  });

  it("is true when q is set", () => {
    expect(hasActiveAdminTicketFilters({ page: 1, q: "printer", status: "all", priority: "all", assignee: "" })).toBe(
      true
    );
  });

  it("is true when status is set", () => {
    expect(hasActiveAdminTicketFilters({ page: 1, q: "", status: "new", priority: "all", assignee: "" })).toBe(true);
  });

  it("is true when priority is set", () => {
    expect(hasActiveAdminTicketFilters({ page: 1, q: "", status: "all", priority: "high", assignee: "" })).toBe(
      true
    );
  });

  it("is true when assignee is set (including 'unassigned')", () => {
    expect(
      hasActiveAdminTicketFilters({ page: 1, q: "", status: "all", priority: "all", assignee: "unassigned" })
    ).toBe(true);
  });
});
