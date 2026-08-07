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

const { addAdminTicketCommentAction } = await import("./add-admin-ticket-comment");

const TICKET_ID = "123e4567-e89b-12d3-a456-426614174000";
const ADMIN_PROFILE = { id: "admin-1", fullName: "Admin", role: "admin" as const, department: null, isActive: true };

function validFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("message", "Проверил, проблема подтверждена.");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe("addAdminTicketCommentAction", () => {
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

      await addAdminTicketCommentAction(TICKET_ID, validFormData());

      expect(callOrder).toEqual(["requireAdmin", "createDataApiClient"]);
    });

    it("an employee rejection prevents the RPC from ever being called", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/unauthorized"));

      await expect(addAdminTicketCommentAction(TICKET_ID, validFormData())).rejects.toThrow(
        "NEXT_REDIRECT"
      );

      expect(createDataApiClient).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("an unauthenticated rejection prevents the RPC from ever being called", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/login"));

      await expect(addAdminTicketCommentAction(TICKET_ID, validFormData())).rejects.toThrow(
        "NEXT_REDIRECT"
      );

      expect(createDataApiClient).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("requireAdmin is called with no caller-provided role/id", async () => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
      rpc.mockResolvedValue({ error: null });

      await addAdminTicketCommentAction(TICKET_ID, validFormData({ role: "admin", userId: "attacker" }));

      expect(requireAdmin.mock.calls[0]).toEqual([]);
    });
  });

  describe("validation", () => {
    beforeEach(() => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
      rpc.mockResolvedValue({ error: null });
    });

    it("accepts a valid ticket id and message", async () => {
      const result = await addAdminTicketCommentAction(TICKET_ID, validFormData());

      expect(result.error).toBeUndefined();
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it("an invalid ticket id prevents the RPC from being called", async () => {
      const result = await addAdminTicketCommentAction("not-a-uuid", validFormData());

      expect(result.error).toBeTruthy();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("an empty message is rejected before the RPC", async () => {
      const formData = new FormData();
      formData.set("message", "");

      const result = await addAdminTicketCommentAction(TICKET_ID, formData);

      expect(result.error).toBeTruthy();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("a message over 3000 characters is rejected before the RPC", async () => {
      const formData = new FormData();
      formData.set("message", "a".repeat(3001));

      const result = await addAdminTicketCommentAction(TICKET_ID, formData);

      expect(result.error).toBeTruthy();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("accepts a message at exactly 3000 characters", async () => {
      const formData = new FormData();
      formData.set("message", "a".repeat(3000));

      const result = await addAdminTicketCommentAction(TICKET_ID, formData);

      expect(result.error).toBeUndefined();
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it("extra role/adminId/actorId/updatedBy/userId form fields are read but never trusted or forwarded", async () => {
      await addAdminTicketCommentAction(
        TICKET_ID,
        validFormData({
          role: "admin",
          adminId: "attacker",
          actorId: "attacker",
          updatedBy: "attacker",
          userId: "attacker",
        })
      );

      expect(rpc).toHaveBeenCalledWith("add_ticket_comment", {
        p_ticket_id: TICKET_ID,
        p_message: "Проверил, проблема подтверждена.",
      });
    });
  });

  describe("RPC call shape", () => {
    beforeEach(() => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
      rpc.mockResolvedValue({ error: null });
    });

    it("calls exactly add_ticket_comment with p_ticket_id/p_message", async () => {
      await addAdminTicketCommentAction(TICKET_ID, validFormData());

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("add_ticket_comment", {
        p_ticket_id: TICKET_ID,
        p_message: "Проверил, проблема подтверждена.",
      });
    });
  });

  describe("read/write boundary", () => {
    it("never touches .from() — no direct table insert/update/delete", async () => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
      rpc.mockResolvedValue({ error: null });

      await addAdminTicketCommentAction(TICKET_ID, validFormData());

      expect(from).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
    });

    it("maps an RPC error to a safe generic message", async () => {
      rpc.mockResolvedValue({ error: { message: "Ticket not found", code: "P0002" } });

      const result = await addAdminTicketCommentAction(TICKET_ID, validFormData());

      expect(result.error).toBeTruthy();
      expect(result.error).not.toMatch(/SQL|Ticket not found/i);
    });

    it("never returns the raw Error.message, UUIDs, or auth ids to the caller", async () => {
      rpc.mockResolvedValue({
        error: { message: `Secret internal detail for ticket ${TICKET_ID} by admin-1`, code: "XXYYY" },
      });

      const result = await addAdminTicketCommentAction(TICKET_ID, validFormData());

      expect(result.error).not.toContain(TICKET_ID);
      expect(result.error).not.toContain("admin-1");
      expect(result.error).not.toMatch(/Secret internal detail/);
    });

    it("logs a sanitized message/code rather than swallowing the error silently", async () => {
      rpc.mockResolvedValue({ error: { message: "boom", code: "P0002" } });

      await addAdminTicketCommentAction(TICKET_ID, validFormData());

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
      const result = await addAdminTicketCommentAction(TICKET_ID, validFormData());
      expect(result).toEqual({});
    });

    it("revalidates the exact concrete admin detail URL for the validated ticket id", async () => {
      await addAdminTicketCommentAction(TICKET_ID, validFormData());
      expect(revalidatePath).toHaveBeenCalledWith(`/admin/tickets/${TICKET_ID}`);
    });

    it("never revalidates the registry route — a comment doesn't change registry data", async () => {
      await addAdminTicketCommentAction(TICKET_ID, validFormData());
      expect(revalidatePath).not.toHaveBeenCalledWith("/admin/tickets");
    });

    it("never revalidates the employee route or the literal dynamic-segment pattern", async () => {
      await addAdminTicketCommentAction(TICKET_ID, validFormData());
      expect(revalidatePath).not.toHaveBeenCalledWith(expect.stringContaining("/app/tickets"));
      expect(revalidatePath).not.toHaveBeenCalledWith("/admin/tickets/[id]");
    });
  });

  describe("revalidation only follows success", () => {
    it("a validation failure never revalidates anything", async () => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);

      await addAdminTicketCommentAction("not-a-uuid", validFormData());

      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("an auth failure never revalidates anything", async () => {
      requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT;/unauthorized"));

      await expect(addAdminTicketCommentAction(TICKET_ID, validFormData())).rejects.toThrow();

      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("an RPC failure never revalidates anything", async () => {
      requireAdmin.mockResolvedValue(ADMIN_PROFILE);
      rpc.mockResolvedValue({ error: { message: "boom", code: "P0002" } });

      await addAdminTicketCommentAction(TICKET_ID, validFormData());

      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
