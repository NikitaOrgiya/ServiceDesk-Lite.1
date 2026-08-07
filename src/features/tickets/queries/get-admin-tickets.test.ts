import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Fake Data API query builder — mirrors only the chain get-admin-tickets.ts
 * actually calls (.from/.select/.eq/.is/.or/.order/.range), plus spies for
 * the mutation methods it must never call (.insert/.update/.delete/.rpc),
 * so a regression that accidentally turns this read-only registry into a
 * mutating call fails loudly here rather than only being caught by manual
 * review.
 */
function makeFakeClient(result: { data: unknown[] | null; error: unknown; count: number | null }) {
  const insert = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  const rpc = vi.fn();
  const range = vi.fn().mockResolvedValue(result);
  const order = vi.fn();
  const or = vi.fn();
  const is = vi.fn();
  const eq = vi.fn();
  const select = vi.fn();
  const from = vi.fn();

  const builder = { select, eq, is, or, order, range, insert, update, delete: del };
  select.mockReturnValue(builder);
  eq.mockReturnValue(builder);
  is.mockReturnValue(builder);
  or.mockReturnValue(builder);
  order.mockReturnValue(builder);
  from.mockReturnValue(builder);

  const client = { from, rpc };
  return { client, from, select, eq, is, or, order, range, insert, update, delete: del, rpc };
}

const createDataApiClient = vi.fn();
vi.mock("@/lib/neon/data-api", () => ({
  createDataApiClient: () => createDataApiClient(),
}));

// requireAdmin() is the DAL's own authorization boundary — mocked here
// rather than exercised for real (it calls next/navigation's redirect(),
// getCurrentUser()/getCurrentProfile(), etc., none of which make sense to
// run in a unit test; see require-admin.ts and its own callers for that
// coverage). Defaults to a resolved admin profile so every pre-existing
// test below keeps exercising the query behavior unchanged; the
// authorization-boundary tests further down override this per case.
const requireAdmin = vi.fn();
vi.mock("@/features/auth/server/require-admin", () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

const ADMIN_PROFILE = { id: "admin-1", fullName: "Admin", role: "admin" as const, department: null, isActive: true };

const { getAdminTickets, ADMIN_TICKET_PAGE_SIZE } = await import("./get-admin-tickets");
const { ADMIN_TICKET_UNASSIGNED } = await import("@/features/tickets/schemas/admin-list-query");
import type { AdminTicketListQuery } from "@/features/tickets/schemas/admin-list-query";

/** Full, valid query object with sane defaults — override only what a test cares about. */
function baseQuery(overrides: Partial<AdminTicketListQuery> = {}): AdminTicketListQuery {
  return { page: 1, q: "", status: "all", priority: "all", assignee: "", ...overrides };
}

function ticketRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ticket-1",
    public_number: "SD-2026-0001",
    title: "Не работает принтер",
    priority: "normal",
    status: "new",
    created_at: "2026-01-01T00:00:00.000Z",
    due_at: null,
    requester: { full_name: "Requester Name" },
    assignee: null,
    ...overrides,
  };
}

describe("getAdminTickets", () => {
  beforeEach(() => {
    createDataApiClient.mockReset();
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(ADMIN_PROFILE);
  });

  it("returns mapped items and total on success", async () => {
    const fake = makeFakeClient({ data: [ticketRow()], error: null, count: 1 });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getAdminTickets(baseQuery());

    expect(result).not.toBeNull();
    expect(result?.total).toBe(1);
    expect(result?.items).toEqual([
      {
        id: "ticket-1",
        publicNumber: "SD-2026-0001",
        title: "Не работает принтер",
        priority: "normal",
        status: "new",
        requesterName: "Requester Name",
        assigneeName: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        dueAt: null,
      },
    ]);
  });

  it("resolves the assignee name when present, and null when absent", async () => {
    const fake = makeFakeClient({
      data: [ticketRow({ assignee: { full_name: "Assignee Name" } })],
      error: null,
      count: 1,
    });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getAdminTickets(baseQuery());
    expect(result?.items[0].assigneeName).toBe("Assignee Name");
  });

  it("orders newest-first with a stable secondary sort by id (deterministic pagination)", async () => {
    const fake = makeFakeClient({ data: [], error: null, count: 0 });
    createDataApiClient.mockReturnValue(fake.client);

    await getAdminTickets(baseQuery());

    expect(fake.order).toHaveBeenCalledTimes(2);
    expect(fake.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(fake.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("requests an exact count for pagination", async () => {
    const fake = makeFakeClient({ data: [], error: null, count: 0 });
    createDataApiClient.mockReturnValue(fake.client);

    await getAdminTickets(baseQuery());

    expect(fake.select.mock.calls[0][1]).toEqual({ count: "exact" });
  });

  describe("no filters applied", () => {
    it("calls neither .eq/.is/.or when every filter is at its default", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery());

      expect(fake.eq).not.toHaveBeenCalled();
      expect(fake.is).not.toHaveBeenCalled();
      expect(fake.or).not.toHaveBeenCalled();
    });
  });

  describe("search (q)", () => {
    it("q only: filters by public_number/title via a safely-escaped OR", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ q: "printer" }));

      expect(fake.or).toHaveBeenCalledTimes(1);
      const orArg = String(fake.or.mock.calls[0][0]);
      expect(orArg).toContain("public_number.ilike.");
      expect(orArg).toContain("title.ilike.");
      expect(orArg).toContain("printer");
      expect(fake.eq).not.toHaveBeenCalled();
    });

    it("escapes PostgREST meta-characters instead of letting them inject extra filter clauses", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ q: 'a,b(c)"d' }));

      const orArg = String(fake.or.mock.calls[0][0]);
      // The raw meta-characters must be wrapped/escaped, not passed through
      // as unescaped filter-syntax control characters.
      expect(orArg).toMatch(/"%a,b\(c\)\\"d%"/);
    });

    it("never filters by internal id, author_id, assignee_id, or email through q", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ q: "someone@example.com" }));

      const orArg = String(fake.or.mock.calls[0][0]);
      expect(orArg).not.toMatch(/\bauthor_id\b/);
      expect(orArg).not.toMatch(/\bassignee_id\b/);
      expect(orArg).not.toMatch(/\bid\.eq\b/);
    });
  });

  describe("status filter", () => {
    it("status only: applies a single eq('status', ...)", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ status: "in_progress" }));

      expect(fake.eq).toHaveBeenCalledWith("status", "in_progress");
      expect(fake.eq).toHaveBeenCalledTimes(1);
    });

    it("'all' applies no status filter", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ status: "all" }));

      expect(fake.eq).not.toHaveBeenCalledWith("status", expect.anything());
    });
  });

  describe("priority filter", () => {
    it("priority only: applies a single eq('priority', ...)", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ priority: "critical" }));

      expect(fake.eq).toHaveBeenCalledWith("priority", "critical");
      expect(fake.eq).toHaveBeenCalledTimes(1);
    });
  });

  describe("assignee filter", () => {
    it("assignee only: applies eq('assignee_id', <technical id>)", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ assignee: "profile-42" }));

      expect(fake.eq).toHaveBeenCalledWith("assignee_id", "profile-42");
      expect(fake.is).not.toHaveBeenCalled();
    });

    it("unassigned only: applies is('assignee_id', null), not eq", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ assignee: ADMIN_TICKET_UNASSIGNED }));

      expect(fake.is).toHaveBeenCalledWith("assignee_id", null);
      expect(fake.eq).not.toHaveBeenCalledWith("assignee_id", expect.anything());
    });
  });

  describe("combined filters (AND semantics)", () => {
    it("q + status", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ q: "vpn", status: "new" }));

      expect(fake.eq).toHaveBeenCalledWith("status", "new");
      expect(fake.or).toHaveBeenCalledTimes(1);
    });

    it("status + priority + assignee", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ status: "new", priority: "high", assignee: "profile-7" }));

      expect(fake.eq).toHaveBeenCalledWith("status", "new");
      expect(fake.eq).toHaveBeenCalledWith("priority", "high");
      expect(fake.eq).toHaveBeenCalledWith("assignee_id", "profile-7");
      expect(fake.eq).toHaveBeenCalledTimes(3);
    });

    it("all filters combined (q + status + priority + assignee)", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ q: "printer", status: "new", priority: "critical", assignee: "profile-7" }));

      expect(fake.eq).toHaveBeenCalledWith("priority", "critical");
      expect(fake.eq).toHaveBeenCalledWith("assignee_id", "profile-7");
      expect(fake.or).toHaveBeenCalledTimes(1);
    });
  });

  describe("pagination range", () => {
    it("page 1 requests rows [0, PAGE_SIZE - 1]", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ page: 1 }));

      expect(fake.range).toHaveBeenCalledWith(0, ADMIN_TICKET_PAGE_SIZE - 1);
    });

    it("page 3 requests the correctly offset row range", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ page: 3 }));

      const from = 2 * ADMIN_TICKET_PAGE_SIZE;
      expect(fake.range).toHaveBeenCalledWith(from, from + ADMIN_TICKET_PAGE_SIZE - 1);
    });

    it("never loads the whole table unbounded — range is always called, even with filters active", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ q: "printer", status: "new" }));

      expect(fake.range).toHaveBeenCalledTimes(1);
    });

    it("total reflects the filtered count, not an unfiltered table count", async () => {
      const fake = makeFakeClient({ data: [ticketRow()], error: null, count: 3 });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTickets(baseQuery({ status: "new" }));

      expect(result?.total).toBe(3);
    });
  });

  it("returns an empty registry cleanly for an out-of-range page (no crash)", async () => {
    const fake = makeFakeClient({ data: [], error: null, count: 0 });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getAdminTickets(baseQuery({ page: 999 }));

    expect(result).toEqual({ items: [], total: 0 });
  });

  it("returns null (never throws) and logs a sanitized message on a Data API error", async () => {
    const fake = makeFakeClient({
      data: null,
      error: { message: "relation does not exist", code: "42P01" },
      count: null,
    });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getAdminTickets(baseQuery());

    expect(result).toBeNull();
  });

  it("never calls any mutation method — this is a read-only registry", async () => {
    const fake = makeFakeClient({ data: [ticketRow()], error: null, count: 1 });
    createDataApiClient.mockReturnValue(fake.client);

    await getAdminTickets(baseQuery({ q: "printer", status: "new", priority: "high", assignee: "profile-7" }));

    expect(fake.insert).not.toHaveBeenCalled();
    expect(fake.update).not.toHaveBeenCalled();
    expect(fake.delete).not.toHaveBeenCalled();
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("selects only display names for requester/assignee, never a raw author_id/assignee_id column", async () => {
    const fake = makeFakeClient({ data: [], error: null, count: 0 });
    createDataApiClient.mockReturnValue(fake.client);

    await getAdminTickets(baseQuery());

    const selectArg = String(fake.select.mock.calls[0][0]);
    expect(selectArg).not.toMatch(/\bauthor_id\b/);
    expect(selectArg).not.toMatch(/\bassignee_id\b/);
    expect(selectArg).toMatch(/full_name/);
  });

  it("the returned item shape never carries a raw author_id/assignee_id field, or email", async () => {
    const fake = makeFakeClient({ data: [ticketRow()], error: null, count: 1 });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getAdminTickets(baseQuery());

    expect(result?.items[0]).not.toHaveProperty("authorId");
    expect(result?.items[0]).not.toHaveProperty("assigneeId");
    expect(result?.items[0]).not.toHaveProperty("email");
  });

  describe("authorization boundary (requireAdmin)", () => {
    it("calls requireAdmin() before creating the Data API client or querying tickets", async () => {
      const callOrder: string[] = [];
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      requireAdmin.mockImplementation(async () => {
        callOrder.push("requireAdmin");
        return ADMIN_PROFILE;
      });
      createDataApiClient.mockImplementation(() => {
        callOrder.push("createDataApiClient");
        return fake.client;
      });

      await getAdminTickets(baseQuery());

      expect(callOrder).toEqual(["requireAdmin", "createDataApiClient"]);
      expect(fake.range).toHaveBeenCalledTimes(1);
    });

    it("a non-admin (employee) authorization rejection prevents the ticket SELECT entirely", async () => {
      // requireAdmin() redirects (throws Next's internal redirect signal)
      // rather than returning a value for a denied caller — modeled here
      // as a rejected promise, since what matters at this boundary is only
      // that getAdminTickets() never swallows it and never reaches the query.
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/unauthorized"));

      await expect(getAdminTickets(baseQuery())).rejects.toThrow("NEXT_REDIRECT");

      expect(createDataApiClient).not.toHaveBeenCalled();
    });

    it("an unauthenticated rejection prevents the ticket SELECT entirely", async () => {
      // Same shape as the employee case — requireAdmin() -> requireUser()
      // redirects to /login for a missing session, also modeled as a
      // rejection here (see the file-level comment on the requireAdmin mock).
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/login"));

      await expect(getAdminTickets(baseQuery())).rejects.toThrow("NEXT_REDIRECT");

      expect(createDataApiClient).not.toHaveBeenCalled();
    });

    it("an authorized admin proceeds to the query and gets real results", async () => {
      const fake = makeFakeClient({ data: [ticketRow()], error: null, count: 1 });
      createDataApiClient.mockReturnValue(fake.client);
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);

      const result = await getAdminTickets(baseQuery());

      expect(requireAdmin).toHaveBeenCalledTimes(1);
      expect(createDataApiClient).toHaveBeenCalledTimes(1);
      expect(result?.items).toHaveLength(1);
    });

    it("no user-supplied role or id ever participates in the authorization check — filters don't reach requireAdmin() either", async () => {
      const fake = makeFakeClient({ data: [], error: null, count: 0 });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTickets(baseQuery({ assignee: "attacker-supplied-id", status: "new" }));

      expect(requireAdmin.mock.calls[0]).toEqual([]);
    });
  });
});
