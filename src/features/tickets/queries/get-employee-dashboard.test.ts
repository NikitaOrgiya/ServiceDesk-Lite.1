import { describe, expect, it, vi, beforeEach } from "vitest";

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

const requireEmployee = vi.fn();
vi.mock("@/features/auth/server/require-employee", () => ({
  requireEmployee: (...args: unknown[]) => requireEmployee(...args),
}));

const logger = { error: vi.fn(), warn: vi.fn() };
vi.mock("@/lib/logger/logger", () => ({ logger }));

const { getEmployeeDashboardCounts } = await import("./get-employee-dashboard");

const EMPLOYEE_PROFILE = { id: "u1", fullName: "Employee", role: "employee" as const, department: null, isActive: true };

describe("getEmployeeDashboardCounts", () => {
  beforeEach(() => {
    createDataApiClient.mockReset();
    requireEmployee.mockReset();
    requireEmployee.mockResolvedValue(EMPLOYEE_PROFILE);
    logger.error.mockReset();
  });

  it("calls requireEmployee before creating the Data API client", async () => {
    const callOrder: string[] = [];
    const fake = makeFakeClient({ data: [], error: null });
    requireEmployee.mockImplementation(async () => {
      callOrder.push("requireEmployee");
      return EMPLOYEE_PROFILE;
    });
    createDataApiClient.mockImplementation(() => {
      callOrder.push("createDataApiClient");
      return fake.client;
    });

    await getEmployeeDashboardCounts();

    expect(callOrder).toEqual(["requireEmployee", "createDataApiClient"]);
  });

  it("an unauthenticated rejection prevents the Data API query entirely", async () => {
    requireEmployee.mockRejectedValue(new Error("NEXT_REDIRECT;/login"));

    await expect(getEmployeeDashboardCounts()).rejects.toThrow("NEXT_REDIRECT");

    expect(createDataApiClient).not.toHaveBeenCalled();
  });

  it("existing bucketing behavior is unchanged", async () => {
    const fake = makeFakeClient({
      data: [{ status: "new" }, { status: "in_progress" }, { status: "closed" }],
      error: null,
    });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getEmployeeDashboardCounts();

    expect(result).toEqual({ open: 1, inProgress: 1, waiting: 0, done: 1 });
  });

  it("returns null (never throws) on a Data API error", async () => {
    const fake = makeFakeClient({ data: null, error: { message: "boom", code: "42P01" } });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getEmployeeDashboardCounts();

    expect(result).toBeNull();
  });
});
