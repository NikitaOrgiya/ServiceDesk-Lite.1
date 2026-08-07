import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Fake Data API query builder — mirrors only the chain
 * get-admin-dashboard.ts actually calls (.from/.select), plus spies for
 * the mutation methods it must never call, so a regression that
 * accidentally turns this read-only dashboard query into a mutating call
 * fails loudly here rather than only being caught by manual review.
 */
function makeFakeClient(result: { data: unknown[] | null; error: unknown }) {
  const insert = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  const rpc = vi.fn();
  const select = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ select, insert, update, delete: del });

  const client = { from, rpc };
  return { client, from, select, insert, update, delete: del, rpc };
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

const { getAdminDashboardCounts } = await import("./get-admin-dashboard");

const ADMIN_PROFILE = { id: "admin-1", fullName: "Admin", role: "admin" as const, department: null, isActive: true };

function ticketRow(status: string, assigneeId: string | null) {
  return { status, assignee_id: assigneeId };
}

describe("getAdminDashboardCounts", () => {
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

      await getAdminDashboardCounts();

      expect(callOrder).toEqual(["requireAdmin", "createDataApiClient"]);
    });

    it("an employee/unauthenticated rejection prevents the query entirely", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/unauthorized"));

      await expect(getAdminDashboardCounts()).rejects.toThrow("NEXT_REDIRECT");

      expect(createDataApiClient).not.toHaveBeenCalled();
    });
  });

  describe("query shape", () => {
    it("selects only status and assignee_id", async () => {
      const fake = makeFakeClient({ data: [], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminDashboardCounts();

      expect(fake.select).toHaveBeenCalledWith("status, assignee_id");
    });

    it("never calls any mutation method or RPC — this is a read-only dashboard", async () => {
      const fake = makeFakeClient({ data: [ticketRow("new", null)], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminDashboardCounts();

      expect(fake.insert).not.toHaveBeenCalled();
      expect(fake.update).not.toHaveBeenCalled();
      expect(fake.delete).not.toHaveBeenCalled();
      expect(fake.rpc).not.toHaveBeenCalled();
    });
  });

  describe("mapping", () => {
    it("maps and buckets a realistic set of rows", async () => {
      const fake = makeFakeClient({
        data: [
          ticketRow("new", null),
          ticketRow("in_progress", "p1"),
          ticketRow("closed", "p2"),
        ],
        error: null,
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminDashboardCounts();

      expect(result).toEqual({ total: 3, unassigned: 1, inProgress: 1, done: 1 });
    });

    it("returns all zero counts for an empty ticket table", async () => {
      const fake = makeFakeClient({ data: [], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminDashboardCounts();

      expect(result).toEqual({ total: 0, unassigned: 0, inProgress: 0, done: 0 });
    });

    it("the returned shape never carries emails or raw profile/ticket ids", async () => {
      const fake = makeFakeClient({ data: [ticketRow("new", "profile-42")], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminDashboardCounts();

      expect(result).not.toHaveProperty("email");
      expect(result).not.toHaveProperty("assigneeId");
      expect(result).not.toHaveProperty("id");
      expect(JSON.stringify(result)).not.toContain("profile-42");
    });
  });

  describe("error handling", () => {
    it("returns null (never throws) and logs a sanitized message on a Data API error", async () => {
      const fake = makeFakeClient({
        data: null,
        error: { message: "relation does not exist", code: "42P01" },
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminDashboardCounts();

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0][0].code).toBe("42P01");
    });

    it("never surfaces the raw error object, only the sanitized message/code", async () => {
      const rawError = { message: "secret detail", code: "X", stack: "sensitive-stack-trace" };
      const fake = makeFakeClient({ data: null, error: rawError });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminDashboardCounts();

      const logged = logger.error.mock.calls[0][0];
      expect(logged).not.toHaveProperty("stack");
      expect(logged).not.toBe(rawError);
    });
  });
});
