import { describe, expect, it, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/features/auth/server/require-admin", () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

const rpc = vi.fn();
const from = vi.fn();
const createDataApiClient = vi.fn(() => ({ rpc, from }));
vi.mock("@/lib/neon/data-api", () => ({
  createDataApiClient: () => createDataApiClient(),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

const logger = { error: vi.fn(), warn: vi.fn() };
vi.mock("@/lib/logger/logger", () => ({ logger }));

const { updateAdminTicketDueAtAction } = await import("./update-admin-ticket-due-at");

const TICKET_ID = "123e4567-e89b-12d3-a456-426614174000";
const ADMIN_PROFILE = { id: "admin-1", fullName: "Admin", role: "admin" as const, department: null, isActive: true };
const VALID_ISO = "2026-08-07T15:00:00.000Z";

function validFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("ticketId", TICKET_ID);
  formData.set("dueAt", VALID_ISO);
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe("updateAdminTicketDueAtAction", () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    rpc.mockReset();
    from.mockReset();
    createDataApiClient.mockClear();
    revalidatePath.mockReset();
    logger.error.mockReset();
  });

  describe("authorization ordering", () => {
    it("calls requireAdmin before creating the Data API client or the RPC", async () => {
      const callOrder: string[] = [];
      requireAdmin.mockImplementation(async () => {
        callOrder.push("requireAdmin");
        return ADMIN_PROFILE;
      });
      createDataApiClient.mockImplementation(() => {
        callOrder.push("createDataApiClient");
        return { rpc, from };
      });
      rpc.mockResolvedValue({ error: null });

      await updateAdminTicketDueAtAction(validFormData());

      expect(callOrder).toEqual(["requireAdmin", "createDataApiClient"]);
    });

    it("an employee rejection prevents the RPC from ever being called", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/unauthorized"));

      await expect(updateAdminTicketDueAtAction(validFormData())).rejects.toThrow("NEXT_REDIRECT");

      expect(createDataApiClient).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("an unauthenticated rejection prevents the RPC from ever being called", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/login"));

      await expect(updateAdminTicketDueAtAction(validFormData())).rejects.toThrow("NEXT_REDIRECT");

      expect(createDataApiClient).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("requireAdmin is called with no caller-provided role/id", async () => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
      rpc.mockResolvedValue({ error: null });

      await updateAdminTicketDueAtAction(validFormData({ role: "admin", userId: "attacker" }));

      expect(requireAdmin.mock.calls[0]).toEqual([]);
    });
  });

  describe("validation", () => {
    beforeEach(() => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
      rpc.mockResolvedValue({ error: null });
    });

    it("accepts a valid ticket id and an absolute ISO instant", async () => {
      const result = await updateAdminTicketDueAtAction(validFormData());

      expect(result.error).toBeUndefined();
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it("an invalid ticket id prevents the RPC from being called", async () => {
      const result = await updateAdminTicketDueAtAction(validFormData({ ticketId: "not-a-uuid" }));

      expect(result.error).toBeTruthy();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("rejects a timezone-less local datetime string at the server boundary", async () => {
      const result = await updateAdminTicketDueAtAction(validFormData({ dueAt: "2026-08-07T15:00" }));

      expect(result.error).toBeTruthy();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("rejects a malformed date string", async () => {
      const result = await updateAdminTicketDueAtAction(validFormData({ dueAt: "not-a-date" }));

      expect(result.error).toBeTruthy();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("maps the empty-string clear sentinel to a null p_due_at", async () => {
      await updateAdminTicketDueAtAction(validFormData({ dueAt: "" }));

      expect(rpc).toHaveBeenCalledWith("admin_set_ticket_due_at", {
        p_ticket_id: TICKET_ID,
        p_due_at: null,
      });
    });

    it("missing fields fail safely without calling the RPC", async () => {
      const formData = new FormData();
      formData.set("ticketId", TICKET_ID);
      // dueAt intentionally omitted — formData.get("dueAt") is null, not "".
      const result = await updateAdminTicketDueAtAction(formData);

      expect(result.error).toBeTruthy();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("extra role/user/updatedBy/currentDueAt form fields are read but never trusted or forwarded", async () => {
      await updateAdminTicketDueAtAction(
        validFormData({
          role: "admin",
          userId: "attacker",
          adminId: "attacker",
          actorId: "attacker",
          updatedBy: "attacker",
          currentDueAt: "2020-01-01T00:00:00.000Z",
        })
      );

      expect(rpc).toHaveBeenCalledWith("admin_set_ticket_due_at", {
        p_ticket_id: TICKET_ID,
        p_due_at: VALID_ISO,
      });
    });
  });

  describe("RPC call shape", () => {
    beforeEach(() => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
      rpc.mockResolvedValue({ error: null });
    });

    it("calls exactly admin_set_ticket_due_at with p_ticket_id/p_due_at", async () => {
      await updateAdminTicketDueAtAction(validFormData());

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("admin_set_ticket_due_at", {
        p_ticket_id: TICKET_ID,
        p_due_at: VALID_ISO,
      });
    });
  });

  describe("read/write boundary", () => {
    it("never touches .from() — no direct table update/insert/delete and no manual history write", async () => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
      rpc.mockResolvedValue({ error: null });

      await updateAdminTicketDueAtAction(validFormData());

      expect(from).not.toHaveBeenCalled();
    });
  });

  describe("error mapping", () => {
    beforeEach(() => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
    });

    it("maps a not-found (P0002) error to a safe generic result", async () => {
      rpc.mockResolvedValue({ error: { message: "Ticket not found", code: "P0002" } });

      const result = await updateAdminTicketDueAtAction(validFormData());

      expect(result.error).toBeTruthy();
      expect(result.error).not.toMatch(/SQL|Ticket not found/i);
    });

    it("maps a not-authorized (42501) error to a safe authorization message", async () => {
      rpc.mockResolvedValue({
        error: { message: "Administrator privileges required", code: "42501" },
      });

      const result = await updateAdminTicketDueAtAction(validFormData());

      expect(result.error).toBeTruthy();
      expect(result.error).not.toMatch(/Administrator privileges required/);
    });

    it("sanitizes and generically maps an unrecognized DB error", async () => {
      rpc.mockResolvedValue({
        error: { message: "relation public.tickets does not exist", code: "42P01" },
      });

      const result = await updateAdminTicketDueAtAction(validFormData());

      expect(result.error).toBeTruthy();
      expect(result.error).not.toMatch(/relation|does not exist/);
    });

    it("never returns the raw Error.message, UUIDs, or auth ids to the caller", async () => {
      rpc.mockResolvedValue({
        error: { message: `Secret internal detail for ticket ${TICKET_ID} by admin-1`, code: "XXYYY" },
      });

      const result = await updateAdminTicketDueAtAction(validFormData());

      expect(result.error).not.toContain(TICKET_ID);
      expect(result.error).not.toContain("admin-1");
      expect(result.error).not.toMatch(/Secret internal detail/);
    });

    it("logs a sanitized message/code rather than swallowing the error silently", async () => {
      rpc.mockResolvedValue({ error: { message: "boom", code: "P0002" } });

      await updateAdminTicketDueAtAction(validFormData());

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0][0].code).toBe("P0002");
    });
  });

  describe("success", () => {
    beforeEach(() => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
      rpc.mockResolvedValue({ error: null });
    });

    it("returns an empty (no-error) result", async () => {
      const result = await updateAdminTicketDueAtAction(validFormData());
      expect(result).toEqual({});
    });

    it("revalidates the exact concrete detail URL for the validated ticket id", async () => {
      await updateAdminTicketDueAtAction(validFormData());
      expect(revalidatePath).toHaveBeenCalledWith(`/admin/tickets/${TICKET_ID}`);
    });

    it("revalidates the registry route", async () => {
      await updateAdminTicketDueAtAction(validFormData());
      expect(revalidatePath).toHaveBeenCalledWith("/admin/tickets");
    });

    it("revalidates exactly these two paths, in detail-then-registry order — never the literal dynamic-segment pattern, and never the employee route", async () => {
      await updateAdminTicketDueAtAction(validFormData());

      expect(revalidatePath.mock.calls).toEqual([
        [`/admin/tickets/${TICKET_ID}`],
        ["/admin/tickets"],
      ]);
      expect(revalidatePath).not.toHaveBeenCalledWith("/admin/tickets/[id]");
      expect(revalidatePath).not.toHaveBeenCalledWith(expect.stringContaining("/app/tickets"));
    });
  });

  describe("revalidation only follows success", () => {
    it("a validation failure never revalidates anything", async () => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);

      await updateAdminTicketDueAtAction(validFormData({ ticketId: "not-a-uuid" }));

      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("an auth failure never revalidates anything", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/unauthorized"));

      await expect(updateAdminTicketDueAtAction(validFormData())).rejects.toThrow();

      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("an RPC failure never revalidates anything", async () => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
      rpc.mockResolvedValue({ error: { message: "boom", code: "P0002" } });

      await updateAdminTicketDueAtAction(validFormData());

      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
