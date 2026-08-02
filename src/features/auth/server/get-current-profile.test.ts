import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthRequiredError } from "@neondatabase/postgrest-js";

const getCurrentUser = vi.fn();
vi.mock("@/features/auth/server/get-current-user", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const createDataApiClient = vi.fn(() => ({ from }));
vi.mock("@/lib/neon/data-api", () => ({
  createDataApiClient: () => createDataApiClient(),
}));

const { getCurrentProfile } = await import("./get-current-profile");

describe("getCurrentProfile", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    maybeSingle.mockReset();
  });

  it("returns null without querying the Data API when there is no session", async () => {
    getCurrentUser.mockResolvedValue(null);

    const result = await getCurrentProfile();

    expect(result).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns the mapped profile on a successful lookup", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    maybeSingle.mockResolvedValue({
      data: { id: "u1", full_name: "Ann", role: "employee", department: null, is_active: true },
      error: null,
    });

    const result = await getCurrentProfile();

    expect(result).toEqual({
      id: "u1",
      fullName: "Ann",
      role: "employee",
      department: null,
      isActive: true,
    });
  });

  // Regression coverage for the reported "/login profile lookup throws
  // AuthRequiredError" bug: @neondatabase/postgrest-js's fetchWithToken
  // throws this (not the usual { data, error } shape) when no access
  // token is resolvable yet for the request — e.g. /login's speculative
  // getCurrentProfile() call racing a session cookie that hasn't fully
  // settled. Must be treated as "no profile", not an unhandled crash.
  it("treats a thrown AuthRequiredError as no active session, not a crash", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    maybeSingle.mockRejectedValue(new AuthRequiredError());

    const result = await getCurrentProfile();

    expect(result).toBeNull();
  });

  it("does not swallow an unexpected thrown error", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    maybeSingle.mockRejectedValue(new Error("network exploded"));

    await expect(getCurrentProfile()).rejects.toThrow("network exploded");
  });
});
