import { describe, expect, it } from "vitest";

import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";

describe("ticketIdSchema", () => {
  it("accepts a well-formed UUID", () => {
    expect(ticketIdSchema.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(true);
  });

  it("rejects a non-UUID route param", () => {
    expect(ticketIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(ticketIdSchema.safeParse("1").success).toBe(false);
    expect(ticketIdSchema.safeParse("").success).toBe(false);
    expect(ticketIdSchema.safeParse("' OR 1=1 --").success).toBe(false);
  });
});
