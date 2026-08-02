import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthRequiredError } from "@neondatabase/postgrest-js";

const rpc = vi.fn();
const createDataApiClient = vi.fn(() => ({ rpc }));
vi.mock("@/lib/neon/data-api", () => ({
  createDataApiClient: () => createDataApiClient(),
}));

const { ensureProfileForCurrentUser } = await import("./ensure-profile");

describe("ensureProfileForCurrentUser", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("returns true when the RPC succeeds", async () => {
    rpc.mockResolvedValue({ error: null });

    expect(await ensureProfileForCurrentUser()).toBe(true);
  });

  it("returns false when the RPC itself reports an error (e.g. no invitation)", async () => {
    rpc.mockResolvedValue({ error: { message: "Authentication required", code: "P0001" } });

    expect(await ensureProfileForCurrentUser()).toBe(false);
  });

  // Same underlying condition as get-current-profile.test.ts: the Data
  // API's fetch wrapper throws AuthRequiredError instead of returning
  // { error } when no access token is resolvable yet. Provisioning simply
  // did not run this request — return false (same as any other
  // provisioning failure) rather than letting it crash the caller.
  it("returns false, not a crash, when the Data API throws AuthRequiredError", async () => {
    rpc.mockRejectedValue(new AuthRequiredError());

    expect(await ensureProfileForCurrentUser()).toBe(false);
  });

  it("does not swallow an unexpected thrown error", async () => {
    rpc.mockRejectedValue(new Error("network exploded"));

    await expect(ensureProfileForCurrentUser()).rejects.toThrow("network exploded");
  });
});
