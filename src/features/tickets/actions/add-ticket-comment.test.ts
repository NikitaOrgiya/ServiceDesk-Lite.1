import { describe, expect, it, vi, beforeEach } from "vitest";

const requireEmployee = vi.fn();
vi.mock("@/features/auth/server/require-employee", () => ({
  requireEmployee: (...args: unknown[]) => requireEmployee(...args),
}));

const rpc = vi.fn();
const createDataApiClient = vi.fn(() => ({ rpc }));
vi.mock("@/lib/neon/data-api", () => ({
  createDataApiClient: () => createDataApiClient(),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

const { addTicketCommentAction } = await import("./add-ticket-comment");

const TICKET_ID = "123e4567-e89b-12d3-a456-426614174000";

function validFormData(): FormData {
  const formData = new FormData();
  formData.set("message", "Проблема воспроизводится каждый раз при входе.");
  return formData;
}

describe("addTicketCommentAction", () => {
  beforeEach(() => {
    requireEmployee.mockReset();
    rpc.mockReset();
    createDataApiClient.mockClear();
    revalidatePath.mockReset();
  });

  it("always calls requireEmployee before touching the Data API", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });
    rpc.mockResolvedValue({ error: null });

    await addTicketCommentAction(TICKET_ID, validFormData());

    expect(requireEmployee).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("add_ticket_comment", expect.any(Object));
  });

  it("never invokes the Data API when authorization fails", async () => {
    requireEmployee.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(addTicketCommentAction(TICKET_ID, validFormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(createDataApiClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never invokes the Data API for an invalid ticket id", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });

    const result = await addTicketCommentAction("not-a-uuid", validFormData());

    expect(result.error).toBeTruthy();
    expect(requireEmployee).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never invokes the Data API for an empty comment", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });

    const formData = new FormData();
    formData.set("message", "");

    const result = await addTicketCommentAction(TICKET_ID, formData);

    expect(result.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
});
