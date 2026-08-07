import { describe, expect, it, vi, beforeEach } from "vitest";

function makeFakeClient(result: { data: unknown[] | null; error: unknown; count: number | null }) {
  const insert = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  const rpc = vi.fn();
  const range = vi.fn().mockResolvedValue(result);
  const order = vi.fn();
  const or = vi.fn();
  const eq = vi.fn();
  const select = vi.fn();
  const from = vi.fn();

  const builder = { select, eq, or, order, range, insert, update, delete: del };
  select.mockReturnValue(builder);
  eq.mockReturnValue(builder);
  or.mockReturnValue(builder);
  order.mockReturnValue(builder);
  from.mockReturnValue(builder);

  const client = { from, rpc };
  return { client, from, select, eq, or, order, range, insert, update, delete: del, rpc };
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

const { getEmployeeTickets } = await import("./get-employee-tickets");
import type { TicketListQuery } from "@/features/tickets/schemas/list-query";

const EMPLOYEE_PROFILE = { id: "u1", fullName: "Employee", role: "employee" as const, department: null, isActive: true };

function baseQuery(overrides: Partial<TicketListQuery> = {}): TicketListQuery {
  return { page: 1, pageSize: 10, q: "", status: "all", sort: "newest", ...overrides };
}

describe("getEmployeeTickets", () => {
  beforeEach(() => {
    createDataApiClient.mockReset();
    requireEmployee.mockReset();
    requireEmployee.mockResolvedValue(EMPLOYEE_PROFILE);
    logger.error.mockReset();
  });

  it("calls requireEmployee before creating the Data API client", async () => {
    const callOrder: string[] = [];
    const fake = makeFakeClient({ data: [], error: null, count: 0 });
    requireEmployee.mockImplementation(async () => {
      callOrder.push("requireEmployee");
      return EMPLOYEE_PROFILE;
    });
    createDataApiClient.mockImplementation(() => {
      callOrder.push("createDataApiClient");
      return fake.client;
    });

    await getEmployeeTickets(baseQuery());

    expect(callOrder).toEqual(["requireEmployee", "createDataApiClient"]);
  });

  it("an unauthenticated rejection prevents the Data API query entirely", async () => {
    requireEmployee.mockRejectedValue(new Error("NEXT_REDIRECT;/login"));

    await expect(getEmployeeTickets(baseQuery())).rejects.toThrow("NEXT_REDIRECT");

    expect(createDataApiClient).not.toHaveBeenCalled();
  });

  it("existing mapping/pagination behavior is unchanged", async () => {
    const fake = makeFakeClient({
      data: [
        {
          id: "t1",
          public_number: "SD-2026-0001",
          title: "Не работает принтер",
          category: "hardware",
          priority: "normal",
          status: "new",
          created_at: "2026-01-01T00:00:00.000Z",
          assignee: { full_name: "Assignee Name" },
        },
      ],
      error: null,
      count: 1,
    });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getEmployeeTickets(baseQuery());

    expect(result).toEqual({
      items: [
        {
          id: "t1",
          publicNumber: "SD-2026-0001",
          title: "Не работает принтер",
          category: "hardware",
          priority: "normal",
          status: "new",
          createdAt: "2026-01-01T00:00:00.000Z",
          assigneeName: "Assignee Name",
        },
      ],
      total: 1,
    });
  });

  it("returns null (never throws) on a Data API error", async () => {
    const fake = makeFakeClient({ data: null, error: { message: "boom", code: "42P01" }, count: null });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getEmployeeTickets(baseQuery());

    expect(result).toBeNull();
  });
});
