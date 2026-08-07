import { describe, expect, it } from "vitest";

import { getAdminTicketDetailHref } from "@/features/tickets/components/admin-ticket-table";

describe("getAdminTicketDetailHref", () => {
  it("builds an admin detail route href from the ticket's technical id", () => {
    expect(getAdminTicketDetailHref("11111111-1111-4111-8111-111111111111")).toBe(
      "/admin/tickets/11111111-1111-4111-8111-111111111111"
    );
  });

  it("never points at the employee-only /app/tickets route", () => {
    const href = getAdminTicketDetailHref("11111111-1111-4111-8111-111111111111");
    expect(href).not.toContain("/app/tickets");
  });

  it("stays under /admin/tickets/, never the bare registry route", () => {
    const href = getAdminTicketDetailHref("some-ticket-id");
    expect(href.startsWith("/admin/tickets/")).toBe(true);
  });
});
