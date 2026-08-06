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

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirect(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

const { createTicketAction } = await import("./create-ticket");

function validFormData(): FormData {
  const formData = new FormData();
  formData.set("title", "Не открывается почта");
  formData.set("description", "Почтовый клиент не запускается после обновления.");
  formData.set("category", "software");
  formData.set("priority", "normal");
  return formData;
}

describe("createTicketAction", () => {
  beforeEach(() => {
    requireEmployee.mockReset();
    rpc.mockReset();
    createDataApiClient.mockClear();
    redirect.mockReset();
    revalidatePath.mockReset();
  });

  it("always calls requireEmployee before touching the Data API", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });
    rpc.mockResolvedValue({ data: [{ id: "t1" }], error: null });

    await createTicketAction(validFormData());

    expect(requireEmployee).toHaveBeenCalledTimes(1);
    expect(createDataApiClient).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_ticket", expect.any(Object));
  });

  it("never invokes the Data API when authorization fails", async () => {
    // requireEmployee() redirects (throws) rather than returning for a
    // denied caller — see src/features/auth/server/require-employee.ts.
    requireEmployee.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(createTicketAction(validFormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(createDataApiClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never invokes the Data API for invalid form data", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });

    const formData = new FormData();
    formData.set("title", "abc"); // below the 5-character minimum
    formData.set("description", "too short");
    formData.set("category", "software");
    formData.set("priority", "normal");

    const result = await createTicketAction(formData);

    expect(result?.error).toBeTruthy();
    expect(createDataApiClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("redirects to the new ticket's detail page on success", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });
    rpc.mockResolvedValue({ data: [{ id: "ticket-123" }], error: null });

    await createTicketAction(validFormData());

    expect(redirect).toHaveBeenCalledWith("/app/tickets/ticket-123");
  });

  it("returns a generic error and does not redirect when the RPC fails", async () => {
    requireEmployee.mockResolvedValue({ id: "u1", role: "employee" });
    rpc.mockResolvedValue({ data: null, error: { message: "boom", code: "XXYYY" } });

    const result = await createTicketAction(validFormData());

    expect(result?.error).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
