import { describe, expect, it } from "vitest";

import { adminTicketListQuerySchema, parseAdminTicketListQuery } from "@/features/tickets/schemas/admin-list-query";

describe("adminTicketListQuerySchema", () => {
  it("defaults to page 1 when nothing is provided", () => {
    expect(adminTicketListQuerySchema.parse({})).toEqual({ page: 1 });
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

describe("parseAdminTicketListQuery", () => {
  it("flattens a searchParams-shaped record and applies the default", () => {
    expect(parseAdminTicketListQuery({})).toEqual({ page: 1 });
  });

  it("takes the first value when a key was repeated in the URL", () => {
    expect(parseAdminTicketListQuery({ page: ["2", "7"] }).page).toBe(2);
  });

  it("ignores unrelated query params instead of erroring (search/filters are a later PR)", () => {
    expect(parseAdminTicketListQuery({ page: "2", q: "printer", status: "new" })).toEqual({ page: 2 });
  });
});
