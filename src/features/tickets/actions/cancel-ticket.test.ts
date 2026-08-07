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

const { cancelTicketAction } = await import("./cancel-ticket");

const TICKET_ID = "123e4567-e89b-12d3-a456-426614174000";

describe("cancelTicketAction", () => {
  beforeEach(() => {
    requireEmployee.mockReset();
    rpc.mockReset();
    createDataApiClient.mockClear();
    revalidatePath.mockReset();
  });

  it("always calls requireEmployee before touching the Data API", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });
    rpc.mockResolvedValue({ error: null });

    await cancelTicketAction(TICKET_ID);

    expect(requireEmployee).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("cancel_own_ticket", { p_ticket_id: TICKET_ID });
  });

  it("calls requireEmployee before validating the ticket id (auth -> validation -> Data API/RPC)", async () => {
    const callOrder: string[] = [];
    requireEmployee.mockImplementation(async () => {
      callOrder.push("requireEmployee");
      return { id: "u1", role: "employee" };
    });
    rpc.mockImplementation(async () => {
      callOrder.push("rpc");
      return { error: null };
    });

    await cancelTicketAction(TICKET_ID);

    expect(callOrder).toEqual(["requireEmployee", "rpc"]);
  });

  it("never invokes the Data API when authorization fails", async () => {
    requireEmployee.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(cancelTicketAction(TICKET_ID)).rejects.toThrow("NEXT_REDIRECT");

    expect(createDataApiClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an invalid ticket id is blocked after a successful auth check, never reaching the Data API", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });

    const result = await cancelTicketAction("not-a-uuid");

    expect(result.error).toBeTruthy();
    expect(requireEmployee).toHaveBeenCalledTimes(1);
    expect(createDataApiClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an RPC failure never revalidates anything", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });
    rpc.mockResolvedValue({ error: { message: "boom", code: "P0002" } });

    await cancelTicketAction(TICKET_ID);

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("success still revalidates the same paths as before", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });
    rpc.mockResolvedValue({ error: null });

    await cancelTicketAction(TICKET_ID);

    expect(revalidatePath).toHaveBeenCalledWith(`/app/tickets/${TICKET_ID}`);
    expect(revalidatePath).toHaveBeenCalledWith("/app/tickets");
    expect(revalidatePath).toHaveBeenCalledWith("/app");
  });
});
