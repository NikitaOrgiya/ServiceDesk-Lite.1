import { describe, expect, it } from "vitest";

import {
  adminSetTicketStatusSchema,
  adminSetTicketPrioritySchema,
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
