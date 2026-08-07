import { describe, expect, it } from "vitest";

import { buildAdminTicketHref } from "@/features/tickets/components/admin-ticket-pagination";
import type { AdminTicketListQuery } from "@/features/tickets/schemas/admin-list-query";

function baseQuery(overrides: Partial<AdminTicketListQuery> = {}): AdminTicketListQuery {
  return { page: 1, q: "", status: "all", priority: "all", assignee: "", ...overrides };
}

describe("buildAdminTicketHref", () => {
  it("with no active filters, only sets page", () => {
    expect(buildAdminTicketHref(baseQuery(), 2)).toBe("/admin/tickets?page=2");
  });

  it("Next preserves q", () => {
    const href = buildAdminTicketHref(baseQuery({ q: "vpn", page: 2 }), 3);
    expect(href).toContain("q=vpn");
    expect(href).toContain("page=3");
  });

  it("Next preserves all active filters at once", () => {
    const href = buildAdminTicketHref(
      baseQuery({ q: "vpn", status: "new", priority: "high", assignee: "profile-7", page: 2 }),
      3
    );
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("q")).toBe("vpn");
    expect(params.get("status")).toBe("new");
    expect(params.get("priority")).toBe("high");
    expect(params.get("assignee")).toBe("profile-7");
    expect(params.get("page")).toBe("3");
  });

  it("Previous preserves all active filters too (same builder, smaller page)", () => {
    const href = buildAdminTicketHref(
      baseQuery({ q: "vpn", status: "new", priority: "high", assignee: "profile-7", page: 3 }),
      2
    );
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("q")).toBe("vpn");
    expect(params.get("status")).toBe("new");
    expect(params.get("priority")).toBe("high");
    expect(params.get("assignee")).toBe("profile-7");
    expect(params.get("page")).toBe("2");
  });

  it("only page changes between calls for the same filters", () => {
    const query = baseQuery({ q: "vpn", status: "new" });
    const next = new URLSearchParams(buildAdminTicketHref(query, 5).split("?")[1]);
    const prev = new URLSearchParams(buildAdminTicketHref(query, 4).split("?")[1]);
    expect(next.get("q")).toBe(prev.get("q"));
    expect(next.get("status")).toBe(prev.get("status"));
    expect(next.get("page")).not.toBe(prev.get("page"));
  });

  it("omits status/priority/assignee entirely when they are at their 'no filter' value ('all'/'')", () => {
    const href = buildAdminTicketHref(baseQuery({ status: "all", priority: "all", assignee: "" }), 2);
    expect(href).not.toContain("status=");
    expect(href).not.toContain("priority=");
    expect(href).not.toContain("assignee=");
  });

  it("preserves the unassigned sentinel as an explicit assignee value", () => {
    const href = buildAdminTicketHref(baseQuery({ assignee: "unassigned" }), 2);
    expect(href).toContain("assignee=unassigned");
  });

  it("never reflects an unrecognized/raw param — only the normalized AdminTicketListQuery fields", () => {
    // TypeScript already prevents passing extra keys, but this documents
    // the guarantee: the function reads exactly page/q/status/priority/
    // assignee off the (already-whitelisted) query object and nothing else.
    const href = buildAdminTicketHref(baseQuery({ q: "vpn" }), 2);
    const params = new URLSearchParams(href.split("?")[1]);
    expect([...params.keys()].sort()).toEqual(["page", "q"]);
  });

  it("reset target is /admin/tickets with no query params (documented, not built by this function)", () => {
    // AdminTicketFilters' reset link is a plain, static href, not derived
    // from buildAdminTicketHref — this test documents the invariant that
    // an empty-filter href never accidentally carries other params either.
    expect(buildAdminTicketHref(baseQuery(), 1)).toBe("/admin/tickets?page=1");
  });
});
