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

  it("calls requireEmployee before validating the ticket id/message (auth -> validation -> Data API/RPC)", async () => {
    const callOrder: string[] = [];
    requireEmployee.mockImplementation(async () => {
      callOrder.push("requireEmployee");
      return { id: "u1", role: "employee" };
    });
    rpc.mockImplementation(async () => {
      callOrder.push("rpc");
      return { error: null };
    });

    await addTicketCommentAction(TICKET_ID, validFormData());

    expect(callOrder).toEqual(["requireEmployee", "rpc"]);
  });

  it("never invokes the Data API when authorization fails", async () => {
    requireEmployee.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(addTicketCommentAction(TICKET_ID, validFormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(createDataApiClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an invalid ticket id is blocked after a successful auth check, never reaching the Data API", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });

    const result = await addTicketCommentAction("not-a-uuid", validFormData());

    expect(result.error).toBeTruthy();
    expect(requireEmployee).toHaveBeenCalledTimes(1);
    expect(createDataApiClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an empty comment is blocked after a successful auth check, never reaching the Data API", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });

    const formData = new FormData();
    formData.set("message", "");

    const result = await addTicketCommentAction(TICKET_ID, formData);

    expect(result.error).toBeTruthy();
    expect(requireEmployee).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("success still revalidates the same path as before", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });
    rpc.mockResolvedValue({ error: null });

    await addTicketCommentAction(TICKET_ID, validFormData());

    expect(revalidatePath).toHaveBeenCalledWith(`/app/tickets/${TICKET_ID}`);
  });

  it("an RPC failure never revalidates anything", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });
    rpc.mockResolvedValue({ error: { message: "boom", code: "P0002" } });

    await addTicketCommentAction(TICKET_ID, validFormData());

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
