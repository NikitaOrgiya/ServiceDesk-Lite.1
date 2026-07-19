import { describe, expect, it } from "vitest";

import { getTicketErrorMessage, TICKET_ERROR_MESSAGES } from "@/features/tickets/utils/error-messages";

describe("getTicketErrorMessage", () => {
  it("returns a fixed message for every context", () => {
    for (const context of Object.keys(TICKET_ERROR_MESSAGES) as (keyof typeof TICKET_ERROR_MESSAGES)[]) {
      expect(getTicketErrorMessage(context)).toBe(TICKET_ERROR_MESSAGES[context]);
    }
  });

  it("never contains anything that looks like a SQL error, code, or hint", () => {
    // These are fixed Russian strings independent of the underlying
    // Supabase error — this guards against someone later interpolating
    // sanitizeError() output into one of them.
    for (const message of Object.values(TICKET_ERROR_MESSAGES)) {
      expect(message).not.toMatch(/select|insert|update|delete|policy|constraint|relation|column/i);
      expect(message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    }
  });
});
