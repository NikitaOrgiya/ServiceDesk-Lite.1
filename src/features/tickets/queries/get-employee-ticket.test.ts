import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Fake Data API client dispatching by table name — get-employee-ticket.ts
 * queries `tickets` (select -> eq -> maybeSingle), `ticket_comments` and
 * `ticket_history` (each select -> eq -> order). Only the requireEmployee
 * ordering boundary and the existing null-on-no-row/error behavior are
 * re-verified here — the comment/history mapping itself is unchanged and
 * already covered structurally by this same query shape's admin
 * counterparts (get-admin-ticket-comments.test.ts/get-admin-ticket-history.test.ts).
 */
function makeFakeClient(ticketResult: { data: unknown; error: unknown }) {
  const insert = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  const rpc = vi.fn();

  const ticketMaybeSingle = vi.fn().mockResolvedValue(ticketResult);
  const ticketEq = vi.fn().mockReturnValue({ maybeSingle: ticketMaybeSingle });
  const ticketSelect = vi.fn().mockReturnValue({ eq: ticketEq });

  const collectionOrder = vi.fn().mockResolvedValue({ data: [], error: null });
  const collectionEq = vi.fn().mockReturnValue({ order: collectionOrder });
  const collectionSelect = vi.fn().mockReturnValue({ eq: collectionEq });

  const from = vi.fn((table: string) => {
    if (table === "tickets") return { select: ticketSelect, insert, update, delete: del };
    if (table === "ticket_comments" || table === "ticket_history") {
      return { select: collectionSelect, insert, update, delete: del };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  const client = { from, rpc };
  return { client, from, ticketMaybeSingle, insert, update, delete: del, rpc };
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

const { getEmployeeTicketDetail } = await import("./get-employee-ticket");

const TICKET_ID = "123e4567-e89b-12d3-a456-426614174000";
const EMPLOYEE_PROFILE = { id: "u1", fullName: "Employee", role: "employee" as const, department: null, isActive: true };

describe("getEmployeeTicketDetail", () => {
  beforeEach(() => {
    createDataApiClient.mockReset();
    requireEmployee.mockReset();
    requireEmployee.mockResolvedValue(EMPLOYEE_PROFILE);
    logger.error.mockReset();
  });

  it("calls requireEmployee before creating the Data API client", async () => {
    const callOrder: string[] = [];
    const fake = makeFakeClient({ data: null, error: null });
    requireEmployee.mockImplementation(async () => {
      callOrder.push("requireEmployee");
      return EMPLOYEE_PROFILE;
    });
    createDataApiClient.mockImplementation(() => {
      callOrder.push("createDataApiClient");
      return fake.client;
    });

    await getEmployeeTicketDetail(TICKET_ID);

    expect(callOrder).toEqual(["requireEmployee", "createDataApiClient"]);
  });

  it("an unauthenticated rejection prevents the Data API query entirely", async () => {
    requireEmployee.mockRejectedValue(new Error("NEXT_REDIRECT;/login"));

    await expect(getEmployeeTicketDetail(TICKET_ID)).rejects.toThrow("NEXT_REDIRECT");

    expect(createDataApiClient).not.toHaveBeenCalled();
  });

  it("existing no-row-found (RLS-invisible or missing) behavior is unchanged", async () => {
    const fake = makeFakeClient({ data: null, error: null });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getEmployeeTicketDetail(TICKET_ID);

    expect(result).toBeNull();
  });

  it("returns null (never throws) on a Data API error", async () => {
    const fake = makeFakeClient({ data: null, error: { message: "boom", code: "42P01" } });
    createDataApiClient.mockReturnValue(fake.client);

    const result = await getEmployeeTicketDetail(TICKET_ID);

    expect(result).toBeNull();
  });
});
