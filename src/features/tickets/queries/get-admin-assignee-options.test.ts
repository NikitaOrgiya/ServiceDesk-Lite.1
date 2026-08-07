import { describe, expect, it, vi, beforeEach } from "vitest";

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

const ADMIN_PROFILE = { id: "admin-1", fullName: "Admin", role: "admin" as const, department: null, isActive: true };

const { getAdminAssigneeOptions } = await import("./get-admin-assignee-options");

describe("getAdminAssigneeOptions", () => {
  beforeEach(() => {
    createDataApiClient.mockReset();
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(ADMIN_PROFILE);
  });

  it("returns id/fullName options for active profiles, ordered by full_name", async () => {
    const fake = makeFakeClient({
      data: [
        { id: "profile-1", full_name: "Alice" },
        { id: "profile-2", full_name: "Bob" },
      ],
      error: null,
    });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getAdminAssigneeOptions();

    expect(result).toEqual([
      { id: "profile-1", fullName: "Alice" },
      { id: "profile-2", fullName: "Bob" },
    ]);
    expect(fake.eq).toHaveBeenCalledWith("is_active", true);
    expect(fake.order).toHaveBeenCalledWith("full_name", { ascending: true });
  });

  it("selects only id and full_name — never email or any other profile field", async () => {
    const fake = makeFakeClient({ data: [], error: null });
    createDataApiClient.mockReturnValue(fake.client);

    await getAdminAssigneeOptions();

    const selectArg = String(fake.select.mock.calls[0][0]);
    expect(selectArg).toMatch(/\bid\b/);
    expect(selectArg).toMatch(/full_name/);
    expect(selectArg).not.toMatch(/email/i);
    expect(selectArg).not.toMatch(/\brole\b/);
  });

  it("returns an empty list cleanly when there are no active profiles", async () => {
    const fake = makeFakeClient({ data: [], error: null });
    createDataApiClient.mockReturnValue(fake.client);

    expect(await getAdminAssigneeOptions()).toEqual([]);
  });

  it("returns null (never throws) and never leaks the raw error on a Data API failure", async () => {
    const fake = makeFakeClient({
      data: null,
      error: { message: "relation does not exist", code: "42P01" },
    });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getAdminAssigneeOptions();

    expect(result).toBeNull();
  });

  it("never calls any mutation method", async () => {
    const fake = makeFakeClient({ data: [{ id: "profile-1", full_name: "Alice" }], error: null });
    createDataApiClient.mockReturnValue(fake.client);

    await getAdminAssigneeOptions();

    expect(fake.insert).not.toHaveBeenCalled();
    expect(fake.update).not.toHaveBeenCalled();
    expect(fake.delete).not.toHaveBeenCalled();
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  describe("authorization boundary (requireAdmin)", () => {
    it("calls requireAdmin() before creating the Data API client or querying profiles", async () => {
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

      await getAdminAssigneeOptions();

      expect(callOrder).toEqual(["requireAdmin", "createDataApiClient"]);
    });

    it("a non-admin (employee) authorization rejection prevents the profiles SELECT entirely", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/unauthorized"));

      await expect(getAdminAssigneeOptions()).rejects.toThrow("NEXT_REDIRECT");

      expect(createDataApiClient).not.toHaveBeenCalled();
    });

    it("an unauthenticated rejection prevents the profiles SELECT entirely", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/login"));

      await expect(getAdminAssigneeOptions()).rejects.toThrow("NEXT_REDIRECT");

      expect(createDataApiClient).not.toHaveBeenCalled();
    });

    it("no user-supplied role or id ever participates in the authorization check", async () => {
      const fake = makeFakeClient({ data: [], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminAssigneeOptions();

      expect(requireAdmin.mock.calls[0]).toEqual([]);
    });
  });
});
