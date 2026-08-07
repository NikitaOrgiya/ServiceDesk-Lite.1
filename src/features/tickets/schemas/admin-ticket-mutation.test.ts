import { describe, expect, it } from "vitest";

import {
  adminSetTicketStatusSchema,
  adminSetTicketPrioritySchema,
  adminSetTicketAssigneeSchema,
  adminSetTicketDueAtSchema,
} from "@/features/tickets/schemas/admin-ticket-mutation";

describe("adminSetTicketStatusSchema", () => {
  it("accepts every canonical status", () => {
    for (const status of [
      "new",
      "accepted",
      "in_progress",
      "waiting",
      "resolved",
      "closed",
      "cancelled",
    ]) {
      expect(adminSetTicketStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects an arbitrary/non-canonical status", () => {
    expect(adminSetTicketStatusSchema.safeParse({ status: "deleted" }).success).toBe(false);
    expect(adminSetTicketStatusSchema.safeParse({ status: "" }).success).toBe(false);
    expect(adminSetTicketStatusSchema.safeParse({ status: "'; DROP TABLE tickets; --" }).success).toBe(
      false
    );
  });

  it("rejects a missing status", () => {
    expect(adminSetTicketStatusSchema.safeParse({}).success).toBe(false);
    expect(adminSetTicketStatusSchema.safeParse({ status: null }).success).toBe(false);
  });
});

describe("adminSetTicketPrioritySchema", () => {
  it("accepts every canonical priority", () => {
    for (const priority of ["low", "normal", "high", "critical"]) {
      expect(adminSetTicketPrioritySchema.safeParse({ priority }).success).toBe(true);
    }
  });

  it("rejects an arbitrary/non-canonical priority", () => {
    expect(adminSetTicketPrioritySchema.safeParse({ priority: "urgent" }).success).toBe(false);
    expect(adminSetTicketPrioritySchema.safeParse({ priority: "" }).success).toBe(false);
  });

  it("rejects a missing priority", () => {
    expect(adminSetTicketPrioritySchema.safeParse({}).success).toBe(false);
    expect(adminSetTicketPrioritySchema.safeParse({ priority: null }).success).toBe(false);
  });
});

describe("adminSetTicketAssigneeSchema", () => {
  it("accepts a bounded, non-empty technical id (not validated as a UUID)", () => {
    expect(adminSetTicketAssigneeSchema.safeParse({ assignee: "profile-42" }).success).toBe(true);
    expect(
      adminSetTicketAssigneeSchema.safeParse({ assignee: "11111111-1111-4111-8111-111111111111" }).success
    ).toBe(true);
  });

  it("accepts the unassigned sentinel as an ordinary bounded string (mapping to null happens in the action, not the schema)", () => {
    expect(adminSetTicketAssigneeSchema.safeParse({ assignee: "unassigned" }).success).toBe(true);
  });

  it("rejects an empty assignee value", () => {
    expect(adminSetTicketAssigneeSchema.safeParse({ assignee: "" }).success).toBe(false);
    expect(adminSetTicketAssigneeSchema.safeParse({ assignee: "   " }).success).toBe(false);
  });

  it("rejects an oversized assignee value", () => {
    const tooLong = "a".repeat(201);
    expect(adminSetTicketAssigneeSchema.safeParse({ assignee: tooLong }).success).toBe(false);
  });

  it("accepts exactly the 200-character bound", () => {
    const exact = "a".repeat(200);
    expect(adminSetTicketAssigneeSchema.safeParse({ assignee: exact }).success).toBe(true);
  });

  it("rejects a missing assignee field", () => {
    expect(adminSetTicketAssigneeSchema.safeParse({}).success).toBe(false);
    expect(adminSetTicketAssigneeSchema.safeParse({ assignee: null }).success).toBe(false);
  });
});

describe("adminSetTicketDueAtSchema", () => {
  it("accepts an absolute ISO instant with a UTC 'Z' offset", () => {
    expect(adminSetTicketDueAtSchema.safeParse({ dueAt: "2026-08-07T15:00:00.000Z" }).success).toBe(
      true
    );
  });

  it("accepts an absolute ISO instant with a numeric offset", () => {
    expect(adminSetTicketDueAtSchema.safeParse({ dueAt: "2026-08-07T18:00:00+03:00" }).success).toBe(
      true
    );
  });

  it("accepts the empty string as the explicit clear sentinel", () => {
    expect(adminSetTicketDueAtSchema.safeParse({ dueAt: "" }).success).toBe(true);
  });

  it("rejects a timezone-less local datetime string", () => {
    expect(adminSetTicketDueAtSchema.safeParse({ dueAt: "2026-08-07T15:00" }).success).toBe(false);
    expect(adminSetTicketDueAtSchema.safeParse({ dueAt: "2026-08-07T15:00:00" }).success).toBe(false);
  });

  it("rejects a malformed date string", () => {
    expect(adminSetTicketDueAtSchema.safeParse({ dueAt: "not-a-date" }).success).toBe(false);
  });

  it("rejects a missing dueAt field", () => {
    expect(adminSetTicketDueAtSchema.safeParse({}).success).toBe(false);
    expect(adminSetTicketDueAtSchema.safeParse({ dueAt: null }).success).toBe(false);
  });
});
