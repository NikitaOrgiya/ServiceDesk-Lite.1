import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Fake Data API client covering both tables get-admin-ticket-history.ts
 * queries: `ticket_history` (select -> eq -> order) and `profiles` (the
 * batch assignee-id lookup: select -> in). Also spies mutation methods on
 * both to prove neither table is ever written to.
 */
function makeFakeClient(
  historyResult: { data: unknown[] | null; error: unknown },
  profilesResult: { data: unknown[] | null; error: unknown } = { data: [], error: null }
) {
  const insert = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  const rpc = vi.fn();

  const historyOrder = vi.fn().mockResolvedValue(historyResult);
  const historyEq = vi.fn().mockReturnValue({ order: historyOrder });
  const historySelect = vi.fn().mockReturnValue({ eq: historyEq });

  const profilesIn = vi.fn().mockResolvedValue(profilesResult);
  const profilesSelect = vi.fn().mockReturnValue({ in: profilesIn });

  const from = vi.fn((table: string) => {
    if (table === "ticket_history") {
      return { select: historySelect, insert, update, delete: del };
    }
    if (table === "profiles") {
      return { select: profilesSelect, insert, update, delete: del };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  const client = { from, rpc };
  return {
    client,
    from,
    historySelect,
    historyEq,
    historyOrder,
    profilesSelect,
    profilesIn,
    insert,
    update,
    delete: del,
    rpc,
  };
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

const { getAdminTicketHistory } = await import("./get-admin-ticket-history");

const TICKET_ID = "123e4567-e89b-12d3-a456-426614174000";
const ADMIN_PROFILE = { id: "admin-1", fullName: "Admin", role: "admin" as const, department: null, isActive: true };

function historyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "history-1",
    event_type: "ticket_created",
    field_name: null,
    old_value: null,
    new_value: null,
    created_at: "2026-01-01T00:00:00.000Z",
    actor: { full_name: "Actor Name" },
    ...overrides,
  };
}

describe("getAdminTicketHistory", () => {
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

      await getAdminTicketHistory(TICKET_ID);

      expect(callOrder).toEqual(["requireAdmin", "createDataApiClient"]);
    });

    it("an employee/unauthenticated rejection prevents the query entirely", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/unauthorized"));

      await expect(getAdminTicketHistory(TICKET_ID)).rejects.toThrow("NEXT_REDIRECT");

      expect(createDataApiClient).not.toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("an invalid ticket id prevents the query and returns an empty list", async () => {
      const result = await getAdminTicketHistory("not-a-uuid");

      expect(result).toEqual([]);
      expect(createDataApiClient).not.toHaveBeenCalled();
    });
  });

  describe("query shape", () => {
    it("filters ticket_history by the exact ticket id, ordered chronologically ascending", async () => {
      const fake = makeFakeClient({ data: [], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketHistory(TICKET_ID);

      expect(fake.historyEq).toHaveBeenCalledWith("ticket_id", TICKET_ID);
      expect(fake.historyOrder).toHaveBeenCalledWith("created_at", { ascending: true });
    });

    it("never calls any mutation method on either table — this is a read-only query", async () => {
      const fake = makeFakeClient({ data: [historyRow()], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketHistory(TICKET_ID);

      expect(fake.insert).not.toHaveBeenCalled();
      expect(fake.update).not.toHaveBeenCalled();
      expect(fake.delete).not.toHaveBeenCalled();
      expect(fake.rpc).not.toHaveBeenCalled();
    });
  });

  describe("event type mapping", () => {
    it.each([
      "ticket_created",
      "status_changed",
      "ticket_cancelled",
      "ticket_closed",
      "priority_changed",
      "assignee_changed",
      "due_at_changed",
    ])("maps %s through unchanged", async (eventType) => {
      const fake = makeFakeClient({ data: [historyRow({ event_type: eventType })], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketHistory(TICKET_ID);
      expect(result[0].eventType).toBe(eventType);
    });

    it("maps non-assignee old_value/new_value (e.g. status/priority) through unchanged", async () => {
      const fake = makeFakeClient({
        data: [historyRow({ event_type: "status_changed", field_name: "status", old_value: "new", new_value: "accepted" })],
        error: null,
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketHistory(TICKET_ID);
      expect(result[0].oldValue).toBe("new");
      expect(result[0].newValue).toBe("accepted");
    });

    it("handles an empty history list", async () => {
      const fake = makeFakeClient({ data: [], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketHistory(TICKET_ID);
      expect(result).toEqual([]);
    });
  });

  describe("assignee id resolution", () => {
    it("batch-resolves assignee_changed old_value/new_value ids to display names in one profiles lookup", async () => {
      const fake = makeFakeClient(
        {
          data: [
            historyRow({
              event_type: "assignee_changed",
              field_name: "assignee_id",
              old_value: "profile-old",
              new_value: "profile-new",
            }),
          ],
          error: null,
        },
        { data: [{ id: "profile-old", full_name: "Old Assignee" }, { id: "profile-new", full_name: "New Assignee" }], error: null }
      );
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketHistory(TICKET_ID);

      expect(result[0].oldValue).toBe("Old Assignee");
      expect(result[0].newValue).toBe("New Assignee");
      expect(fake.profilesIn).toHaveBeenCalledTimes(1);
      expect(fake.profilesIn).toHaveBeenCalledWith("id", expect.arrayContaining(["profile-old", "profile-new"]));
    });

    it("never issues one profiles lookup per row (batches unique ids across all rows)", async () => {
      const fake = makeFakeClient(
        {
          data: [
            historyRow({
              id: "h1",
              event_type: "assignee_changed",
              field_name: "assignee_id",
              old_value: null,
              new_value: "profile-a",
            }),
            historyRow({
              id: "h2",
              event_type: "assignee_changed",
              field_name: "assignee_id",
              old_value: "profile-a",
              new_value: "profile-b",
            }),
          ],
          error: null,
        },
        { data: [{ id: "profile-a", full_name: "A" }, { id: "profile-b", full_name: "B" }], error: null }
      );
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketHistory(TICKET_ID);

      expect(fake.profilesIn).toHaveBeenCalledTimes(1);
      const idsQueried = fake.profilesIn.mock.calls[0][1] as string[];
      expect([...idsQueried].sort()).toEqual(["profile-a", "profile-b"]);
    });

    it("an unresolved assignee id falls back to a safe generic label, never the raw id", async () => {
      const fake = makeFakeClient(
        {
          data: [
            historyRow({
              event_type: "assignee_changed",
              field_name: "assignee_id",
              old_value: null,
              new_value: "deleted-profile-id",
            }),
          ],
          error: null,
        },
        { data: [], error: null }
      );
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketHistory(TICKET_ID);

      expect(result[0].newValue).not.toBe("deleted-profile-id");
      expect(result[0].newValue).toBeTruthy();
    });

    it("a null assignee old/new value stays null, not a placeholder", async () => {
      const fake = makeFakeClient({
        data: [
          historyRow({
            event_type: "assignee_changed",
            field_name: "assignee_id",
            old_value: null,
            new_value: "profile-new",
          }),
        ],
        error: null,
      }, { data: [{ id: "profile-new", full_name: "New Assignee" }], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketHistory(TICKET_ID);
      expect(result[0].oldValue).toBeNull();
    });

    it("never returns the raw assignee profile id anywhere in the mapped result", async () => {
      const fake = makeFakeClient(
        {
          data: [
            historyRow({
              event_type: "assignee_changed",
              field_name: "assignee_id",
              old_value: "profile-old-id",
              new_value: "profile-new-id",
            }),
          ],
          error: null,
        },
        { data: [{ id: "profile-old-id", full_name: "Old" }, { id: "profile-new-id", full_name: "New" }], error: null }
      );
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketHistory(TICKET_ID);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("profile-old-id");
      expect(serialized).not.toContain("profile-new-id");
    });

    it("skips the profiles lookup entirely when there are no assignee_changed rows", async () => {
      const fake = makeFakeClient({ data: [historyRow({ event_type: "status_changed" })], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketHistory(TICKET_ID);

      expect(fake.profilesSelect).not.toHaveBeenCalled();
    });
  });

  describe("actor mapping", () => {
    it("maps the actor's full_name", async () => {
      const fake = makeFakeClient({ data: [historyRow({ actor: { full_name: "Some Admin" } })], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketHistory(TICKET_ID);
      expect(result[0].actorName).toBe("Some Admin");
    });

    it("maps a null actor (system-context write) to null, not a placeholder", async () => {
      const fake = makeFakeClient({ data: [historyRow({ actor: null })], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketHistory(TICKET_ID);
      expect(result[0].actorName).toBeNull();
    });

    it("the SELECT never requests email columns", async () => {
      const fake = makeFakeClient({ data: [], error: null });
      createDataApiClient.mockReturnValue(fake.client);

      await getAdminTicketHistory(TICKET_ID);

      const selectArg = String(fake.historySelect.mock.calls[0][0]);
      expect(selectArg).not.toMatch(/\bemail\b/);
      expect(selectArg).toMatch(/full_name/);
    });
  });

  describe("error handling", () => {
    it("returns an empty list (never throws) and logs a sanitized message on a ticket_history query error", async () => {
      const fake = makeFakeClient({
        data: null,
        error: { message: "relation does not exist", code: "42P01" },
      });
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketHistory(TICKET_ID);

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0][0].code).toBe("42P01");
    });

    it("still returns rows (with unresolved names) when the profiles batch lookup itself fails", async () => {
      const fake = makeFakeClient(
        {
          data: [
            historyRow({
              event_type: "assignee_changed",
              field_name: "assignee_id",
              old_value: null,
              new_value: "profile-x",
            }),
          ],
          error: null,
        },
        { data: null, error: { message: "profiles lookup failed", code: "42P01" } }
      );
      createDataApiClient.mockReturnValue(fake.client);

      const result = await getAdminTicketHistory(TICKET_ID);

      expect(result).toHaveLength(1);
      expect(result[0].newValue).not.toBe("profile-x");
      expect(result[0].newValue).toBeTruthy();
    });
  });
});
