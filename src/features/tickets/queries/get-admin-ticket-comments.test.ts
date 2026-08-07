import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Fake Data API query builder — mirrors only the chain
 * get-admin-ticket-comments.ts actually calls (.from/.select/.eq/.order),
 * plus spies for the mutation methods it must never call, so a regression
 * that accidentally turns this read-only query into a mutating call fails
 * loudly here rather than only being caught by manual review.
 */
function makeFakeClient(result: { data: unknown[] | null; error: unknown }) {
  const insert = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  const rpc = vi.fn();
  const order = vi.fn().mockResolvedValue(result);
  const eq = vi.fn();
  const select = vi.fn();
  const from = vi.fn();

  const builder = { select, eq, order, insert, update, delete: del };
  select.mockReturnValue(builder);
  eq.mockReturnValue(builder);
  from.mockReturnValue(builder);

  const client = { from, rpc };
  return { client, from, select, eq, order, insert, update, delete: del, rpc };
}

const createDataApiClient = vi.fn();
vi.mock("@/lib/neon/data-api", () => ({
  createDataApiClient: () => createDataApiClient(),
}));

const requireAdmin = vi.fn();
vi.mock("@/features/auth/server/require-admin", () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

const logger = { error: vi.fn(), warn: vi.fn() };
vi.mock("@/lib/logger/logger", () => ({ logger }));

const { getAdminTicketComments } = await import("./get-admin-ticket-comments");

const TICKET_ID = "123e4567-e89b-12d3-a456-426614174000";
const ADMIN_PROFILE = { id: "admin-1", fullName: "Admin", role: "admin" as const, department: null, isActive: true };

function commentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "comment-1",
    message: "Проблема воспроизводится каждый раз при входе.",
    created_at: "2026-01-01T00:00:00.000Z",
    author: { full_name: "Author Name", role: "employee" },
    ...overrides,
  };
}

describe("getAdminTicketComments", () => {
  beforeEach(() => {
    createDataApiClient.mockReset();
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(ADMIN_PROFILE);
    logger.error.mockReset();
  });

  describe("authorization ordering", () => {
    it("calls requireAdmin before creating the Data API client", async () => {
      const callOrder: string[] = [];
      const fake = makeFakeClient({ data: [], error: null });
      requireAdmin.mockImplementation(async () => {
        callOrder.push("requireAdmin");
        return ADMIN_PROFILE;
      });
      createDataApiClient.mockImplementation(() => {
        callOrder.push("createDataApiClient");
        return fake.client;
      });

      await getAdminTicketComments(TICKET_ID);

      expect(callOrder).toEqual(["requireAdmin", "createDataApiClient"]);
    });

    it("an employee/unauthenticated rejection prevents the query entirely", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/unauthorized"));

      await expect(getAdminTicketComments(TICKET_ID)).rejects.toThrow("NEXT_REDIRECT");

      expect(createDataApiClient).not.toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("an invalid ticket id prevents the query and returns an empty list", async () => {
      const result = await getAdminTicketComments("not-a-uuid");

      expect(result).toEqual([]);
      expect(createDataApiClient).not.toHaveBeenCalled();
    });
  });

  describe("query shape", () => {
    it("filters by the exact ticket id", async () => {
      const fake = makeFakeClient({ data: [], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketComments(TICKET_ID);

      expect(fake.eq).toHaveBeenCalledWith("ticket_id", TICKET_ID);
    });

    it("orders chronologically ascending (oldest first)", async () => {
      const fake = makeFakeClient({ data: [], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketComments(TICKET_ID);

      expect(fake.order).toHaveBeenCalledWith("created_at", { ascending: true });
    });

    it("never calls any mutation method — this is a read-only query", async () => {
      const fake = makeFakeClient({ data: [commentRow()], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketComments(TICKET_ID);

      expect(fake.insert).not.toHaveBeenCalled();
      expect(fake.update).not.toHaveBeenCalled();
      expect(fake.delete).not.toHaveBeenCalled();
      expect(fake.rpc).not.toHaveBeenCalled();
    });
  });

  describe("mapping", () => {
    it("maps a comment row safely", async () => {
      const fake = makeFakeClient({ data: [commentRow()], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketComments(TICKET_ID);

      expect(result).toEqual([
        {
          id: "comment-1",
          message: "Проблема воспроизводится каждый раз при входе.",
          createdAt: "2026-01-01T00:00:00.000Z",
          authorName: "Author Name",
          authorRole: "employee",
        },
      ]);
    });

    it("maps the author's full_name", async () => {
      const fake = makeFakeClient({
        data: [commentRow({ author: { full_name: "Admin Name", role: "admin" } })],
        error: null,
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketComments(TICKET_ID);
      expect(result[0].authorName).toBe("Admin Name");
    });

    it("maps the author's role", async () => {
      const fake = makeFakeClient({
        data: [commentRow({ author: { full_name: "Admin Name", role: "admin" } })],
        error: null,
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketComments(TICKET_ID);
      expect(result[0].authorRole).toBe("admin");
    });

    it("the SELECT never requests email or raw author_id columns", async () => {
      const fake = makeFakeClient({ data: [], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketComments(TICKET_ID);

      const selectArg = String(fake.select.mock.calls[0][0]);
      expect(selectArg).not.toMatch(/\bemail\b/);
      expect(selectArg).not.toMatch(/\bauthor_id\b/);
      expect(selectArg).toMatch(/full_name/);
    });

    it("the returned shape never carries author_id or email", async () => {
      const fake = makeFakeClient({ data: [commentRow()], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketComments(TICKET_ID);

      expect(result[0]).not.toHaveProperty("authorId");
      expect(result[0]).not.toHaveProperty("author_id");
      expect(result[0]).not.toHaveProperty("email");
    });

    it("handles an empty comment list", async () => {
      const fake = makeFakeClient({ data: [], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketComments(TICKET_ID);
      expect(result).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("returns an empty list (never throws) and logs a sanitized message on a Data API error", async () => {
      const fake = makeFakeClient({
        data: null,
        error: { message: "relation does not exist", code: "42P01" },
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketComments(TICKET_ID);

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0][0].code).toBe("42P01");
    });
  });
});
