import { describe, expect, it } from "vitest";

import { canCancelTicket } from "@/features/tickets/utils/can-cancel-ticket";
import { TICKET_STATUSES } from "@/features/tickets/types/ticket";

describe("canCancelTicket", () => {
  it("is true only for 'new'", () => {
    expect(canCancelTicket("new")).toBe(true);
  });

  it("is false for every other status", () => {
    for (const status of TICKET_STATUSES) {
      if (status === "new") continue;
      expect(canCancelTicket(status)).toBe(false);
    }
  });
});
