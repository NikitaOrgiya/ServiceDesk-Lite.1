import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Fake Data API query builder — mirrors only the chain get-admin-ticket.ts
 * actually calls (.from/.select/.eq/.maybeSingle), plus spies for the
 * mutation methods it must never call (.insert/.update/.delete/.rpc), so a
 * regression that accidentally turns this read-only detail lookup into a
 * mutating call fails loudly here rather than only being caught by manual
 * review. Same shape as get-admin-tickets.test.ts's fake client.
 */
function makeFakeClient(result: { data: unknown; error: unknown }) {
  const insert = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  const rpc = vi.fn();
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn();
  const select = vi.fn();
  const from = vi.fn();

  const builder = { select, eq, maybeSingle, insert, update, delete: del };
  select.mockReturnValue(builder);
  eq.mockReturnValue(builder);
  from.mockReturnValue(builder);

  const client = { from, rpc };
  return { client, from, select, eq, maybeSingle, insert, update, delete: del, rpc };
}

const createDataApiClient = vi.fn();
vi.mock("@/lib/neon/data-api", () => ({
  createDataApiClient: () => createDataApiClient(),
}));

// requireAdmin() is the DAL's own authorization boundary — mocked here
// rather than exercised for real, same reasoning as get-admin-tickets.test.ts.
const requireAdmin = vi.fn();
vi.mock("@/features/auth/server/require-admin", () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

const logger = { error: vi.fn(), warn: vi.fn() };
vi.mock("@/lib/logger/logger", () => ({ logger }));

const ADMIN_PROFILE = { id: "admin-1", fullName: "Admin", role: "admin" as const, department: null, isActive: true };

const { getAdminTicketDetail } = await import("./get-admin-ticket");

function ticketRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ticket-1",
    public_number: "SD-2026-0001",
    title: "Не работает принтер",
    description: "Принтер на 3 этаже не печатает.",
    category: "hardware",
    priority: "normal",
    status: "new",
    due_at: null,
    resolved_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    author: { full_name: "Author Name" },
    assignee: null,
    ...overrides,
  };
}

describe("getAdminTicketDetail", () => {
  beforeEach(() => {
    createDataApiClient.mockReset();
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(ADMIN_PROFILE);
    logger.error.mockReset();
  });

  describe("mapping", () => {
    it("maps a full ticket row to TicketDetail", async () => {
      const fake = makeFakeClient({ data: ticketRow(), error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("ticket-1");

      expect(result).toEqual({
        id: "ticket-1",
        publicNumber: "SD-2026-0001",
        title: "Не работает принтер",
        description: "Принтер на 3 этаже не печатает.",
        category: "hardware",
        priority: "normal",
        status: "new",
        dueAt: null,
        resolvedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        authorName: "Author Name",
        assigneeName: null,
      });
    });

    it("maps the requester (author) relation to a display name", async () => {
      const fake = makeFakeClient({
        data: ticketRow({ author: { full_name: "Requester Name" } }),
        error: null,
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("ticket-1");
      expect(result?.authorName).toBe("Requester Name");
    });

    it("maps the assignee relation to a display name when present", async () => {
      const fake = makeFakeClient({
        data: ticketRow({ assignee: { full_name: "Assignee Name" } }),
        error: null,
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("ticket-1");
      expect(result?.assigneeName).toBe("Assignee Name");
    });

    it("maps a null assignee to null, not a placeholder string", async () => {
      const fake = makeFakeClient({ data: ticketRow({ assignee: null }), error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("ticket-1");
      expect(result?.assigneeName).toBeNull();
    });

    it("maps category as-is (existing enum, no relabeling)", async () => {
      const fake = makeFakeClient({ data: ticketRow({ category: "network" }), error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("ticket-1");
      expect(result?.category).toBe("network");
    });

    it("maps description as plain text", async () => {
      const fake = makeFakeClient({
        data: ticketRow({ description: "Line one\nLine two" }),
        error: null,
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("ticket-1");
      expect(result?.description).toBe("Line one\nLine two");
    });

    it("maps a null due_at to null", async () => {
      const fake = makeFakeClient({ data: ticketRow({ due_at: null }), error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("ticket-1");
      expect(result?.dueAt).toBeNull();
    });

    it("maps a present due_at through unchanged", async () => {
      const fake = makeFakeClient({
        data: ticketRow({ due_at: "2026-02-01T00:00:00.000Z" }),
        error: null,
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("ticket-1");
      expect(result?.dueAt).toBe("2026-02-01T00:00:00.000Z");
    });

    it("maps created_at/updated_at through unchanged", async () => {
      const fake = makeFakeClient({
        data: ticketRow({ created_at: "2026-01-05T00:00:00.000Z", updated_at: "2026-01-06T00:00:00.000Z" }),
        error: null,
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("ticket-1");
      expect(result?.createdAt).toBe("2026-01-05T00:00:00.000Z");
      expect(result?.updatedAt).toBe("2026-01-06T00:00:00.000Z");
    });
  });

  describe("no-row / error behavior", () => {
    it("returns null when the ticket does not exist (or is invisible under RLS)", async () => {
      const fake = makeFakeClient({ data: null, error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("missing-ticket");
      expect(result).toBeNull();
    });

    it("returns null (never throws) and logs a sanitized message on a Data API error", async () => {
      const fake = makeFakeClient({
        data: null,
        error: { message: "relation does not exist", code: "42P01" },
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("ticket-1");

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledTimes(1);
      const logged = logger.error.mock.calls[0][0];
      expect(logged.message).toBe("relation does not exist");
      expect(logged.code).toBe("42P01");
    });

    it("never surfaces the raw error object itself, only the sanitized message/code", async () => {
      const rawError = { message: "secret detail", code: "X", stack: "sensitive-stack-trace" };
      const fake = makeFakeClient({ data: null, error: rawError });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketDetail("ticket-1");

      const logged = logger.error.mock.calls[0][0];
      expect(logged).not.toHaveProperty("stack");
      expect(logged).not.toBe(rawError);
    });
  });

  describe("privacy", () => {
    it("the returned detail never carries author_id/assignee_id, raw profile ids, email, or Auth ids", async () => {
      const fake = makeFakeClient({ data: ticketRow(), error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketDetail("ticket-1");

      expect(result).not.toHaveProperty("authorId");
      expect(result).not.toHaveProperty("assigneeId");
      expect(result).not.toHaveProperty("author_id");
      expect(result).not.toHaveProperty("assignee_id");
      expect(result).not.toHaveProperty("email");
      expect(result).not.toHaveProperty("userId");
      expect(result).not.toHaveProperty("authUserId");
    });

    it("the SELECT itself never requests author_id/assignee_id/email columns", async () => {
      const fake = makeFakeClient({ data: ticketRow(), error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketDetail("ticket-1");

      const selectArg = String(fake.select.mock.calls[0][0]);
      expect(selectArg).not.toMatch(/\bauthor_id\b/);
      expect(selectArg).not.toMatch(/\bassignee_id\b/);
      expect(selectArg).not.toMatch(/\bemail\b/);
      expect(selectArg).toMatch(/full_name/);
    });
  });

  describe("read only", () => {
    it("never calls any mutation method — this is a read-only detail lookup", async () => {
      const fake = makeFakeClient({ data: ticketRow(), error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketDetail("ticket-1");

      expect(fake.insert).not.toHaveBeenCalled();
      expect(fake.update).not.toHaveBeenCalled();
      expect(fake.delete).not.toHaveBeenCalled();
      expect(fake.rpc).not.toHaveBeenCalled();
    });

    it("queries by a single bounded id filter, never an unbounded list", async () => {
      const fake = makeFakeClient({ data: ticketRow(), error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketDetail("ticket-1");

      expect(fake.eq).toHaveBeenCalledWith("id", "ticket-1");
      expect(fake.eq).toHaveBeenCalledTimes(1);
      expect(fake.maybeSingle).toHaveBeenCalledTimes(1);
    });
  });

  describe("authorization boundary (requireAdmin)", () => {
    it("calls requireAdmin() before creating the Data API client or querying the ticket", async () => {
      const callOrder: string[] = [];
      const fake = makeFakeClient({ data: ticketRow(), error: null });
      requireAdmin.mockImplementation(async () => {
        callOrder.push("requireAdmin");
        return ADMIN_PROFILE;
      });
      createDataApiClient.mockImplementation(() => {
        callOrder.push("createDataApiClient");
        return fake.client;
      });

      await getAdminTicketDetail("ticket-1");

      expect(callOrder).toEqual(["requireAdmin", "createDataApiClient"]);
      expect(fake.maybeSingle).toHaveBeenCalledTimes(1);
    });

    it("a non-admin (employee) authorization rejection prevents the ticket SELECT entirely", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/unauthorized"));

      await expect(getAdminTicketDetail("ticket-1")).rejects.toThrow("NEXT_REDIRECT");

      expect(createDataApiClient).not.toHaveBeenCalled();
    });

    it("an unauthenticated rejection prevents the ticket SELECT entirely", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/login"));

      await expect(getAdminTicketDetail("ticket-1")).rejects.toThrow("NEXT_REDIRECT");

      expect(createDataApiClient).not.toHaveBeenCalled();
    });

    it("an authorized admin proceeds to the query and gets a real result", async () => {
      const fake = makeFakeClient({ data: ticketRow(), error: null });
      createDataApiClient.mockReturnValue(fake.client);
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);

      const result = await getAdminTicketDetail("ticket-1");

      expect(requireAdmin).toHaveBeenCalledTimes(1);
      expect(createDataApiClient).toHaveBeenCalledTimes(1);
      expect(result).not.toBeNull();
    });

    it("requireAdmin() is called with no caller-provided role/id — the route's ticket id never participates in authorization", async () => {
      const fake = makeFakeClient({ data: ticketRow(), error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketDetail("attacker-supplied-ticket-id");

      expect(requireAdmin.mock.calls[0]).toEqual([]);
    });
  });
});
