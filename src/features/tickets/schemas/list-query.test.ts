import { describe, expect, it } from "vitest";

import { parseTicketListQuery, ticketListQuerySchema } from "@/features/tickets/schemas/list-query";

describe("ticketListQuerySchema defaults", () => {
  it("fills in every default when nothing is provided", () => {
    const result = ticketListQuerySchema.parse({});
    expect(result).toEqual({ q: "", status: "all", sort: "newest", page: 1, pageSize: 10 });
  });

  it("accepts a fully valid query untouched", () => {
    const result = ticketListQuerySchema.parse({
      q: "принтер",
      status: "in_progress",
      sort: "oldest",
      page: "3",
      pageSize: "20",
    });
    expect(result).toEqual({ q: "принтер", status: "in_progress", sort: "oldest", page: 3, pageSize: 20 });
  });
});

describe("sort whitelist", () => {
  it("falls back to 'newest' for anything not in the whitelist", () => {
    expect(ticketListQuerySchema.parse({ sort: "random_column DESC" }).sort).toBe("newest");
    expect(ticketListQuerySchema.parse({ sort: "" }).sort).toBe("newest");
  });

  it("accepts both whitelisted values", () => {
    expect(ticketListQuerySchema.parse({ sort: "newest" }).sort).toBe("newest");
    expect(ticketListQuerySchema.parse({ sort: "oldest" }).sort).toBe("oldest");
  });
});

describe("pageSize whitelist", () => {
  it("falls back to 10 for a value outside {10, 20, 50}", () => {
    expect(ticketListQuerySchema.parse({ pageSize: "1000000" }).pageSize).toBe(10);
    expect(ticketListQuerySchema.parse({ pageSize: "0" }).pageSize).toBe(10);
    expect(ticketListQuerySchema.parse({ pageSize: "not-a-number" }).pageSize).toBe(10);
  });

  it("accepts every whitelisted page size", () => {
    expect(ticketListQuerySchema.parse({ pageSize: "10" }).pageSize).toBe(10);
    expect(ticketListQuerySchema.parse({ pageSize: "20" }).pageSize).toBe(20);
    expect(ticketListQuerySchema.parse({ pageSize: "50" }).pageSize).toBe(50);
  });
});

describe("page", () => {
  it("falls back to 1 for zero, negative, or non-numeric input", () => {
    expect(ticketListQuerySchema.parse({ page: "0" }).page).toBe(1);
    expect(ticketListQuerySchema.parse({ page: "-5" }).page).toBe(1);
    expect(ticketListQuerySchema.parse({ page: "drop table" }).page).toBe(1);
  });
});

describe("search length limit", () => {
  it("accepts a search term at the limit", () => {
    const q = "а".repeat(120);
    expect(ticketListQuerySchema.parse({ q }).q).toBe(q);
  });

  it("falls back to an empty search when the term is too long", () => {
    const q = "а".repeat(121);
    expect(ticketListQuerySchema.parse({ q }).q).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(ticketListQuerySchema.parse({ q: "  принтер  " }).q).toBe("принтер");
  });
});

describe("status whitelist", () => {
  it("falls back to 'all' for an unknown status", () => {
    expect(ticketListQuerySchema.parse({ status: "deleted" }).status).toBe("all");
  });

  it("accepts every real ticket status plus 'all'", () => {
    for (const status of ["all", "new", "accepted", "in_progress", "waiting", "resolved", "closed", "cancelled"]) {
      expect(ticketListQuerySchema.parse({ status }).status).toBe(status);
    }
  });
});

describe("parseTicketListQuery", () => {
  it("flattens a searchParams-shaped record and applies the same defaults", () => {
    expect(parseTicketListQuery({})).toEqual({
      q: "",
      status: "all",
      sort: "newest",
      page: 1,
      pageSize: 10,
    });
  });

  it("takes the first value when a key was repeated in the URL", () => {
    expect(parseTicketListQuery({ status: ["new", "closed"] }).status).toBe("new");
  });
});
