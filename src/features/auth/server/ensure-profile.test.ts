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
    createDataApiClient.mockClear();
  });

  it("returns true when the RPC succeeds on the first attempt", async () => {
    rpc.mockResolvedValue({ error: null });

    expect(await ensureProfileForCurrentUser()).toBe(true);
    expect(createDataApiClient).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns false when the RPC itself reports an error (e.g. no invitation)", async () => {
    rpc.mockResolvedValue({ error: { message: "Authentication required", code: "P0002" } });

    expect(await ensureProfileForCurrentUser()).toBe(false);
  });

  // Same underlying condition as get-current-profile.test.ts: the Data
  // API's fetch wrapper throws AuthRequiredError instead of returning
  // { error } when no access token is resolvable yet.
  it("retries with a fresh client after a transient AuthRequiredError, then succeeds", async () => {
    rpc.mockRejectedValueOnce(new AuthRequiredError()).mockResolvedValueOnce({ error: null });

    expect(await ensureProfileForCurrentUser()).toBe(true);
    expect(createDataApiClient).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  // Confirmed root cause of the intermittent concurrent-login race: the RPC
  // itself returns `{ error }` (not a thrown AuthRequiredError) with the
  // exact generic P0001 "Authentication required" that
  // public.ensure_profile() raises only when auth.user_id() resolves NULL
  // for an otherwise-authenticated request (see
  // drizzle/0011_invite_only_profile_provisioning.sql).
  it("retries with a fresh client after a transient P0001 'Authentication required', then succeeds", async () => {
    rpc
      .mockResolvedValueOnce({ error: { message: "Authentication required", code: "P0001" } })
      .mockResolvedValueOnce({ error: null });

    expect(await ensureProfileForCurrentUser()).toBe(true);
    expect(createDataApiClient).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("gives up after the maximum number of attempts", async () => {
    rpc.mockRejectedValue(new AuthRequiredError());

    expect(await ensureProfileForCurrentUser()).toBe(false);
    expect(createDataApiClient).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("does not retry an unrelated Postgres error", async () => {
    rpc.mockResolvedValue({ error: { message: "relation does not exist", code: "42P01" } });

    expect(await ensureProfileForCurrentUser()).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not retry an invitation/access-denial failure", async () => {
    rpc.mockResolvedValue({
      error: { message: "Access denied: no active invitation for this account", code: "42501" },
    });

    expect(await ensureProfileForCurrentUser()).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not swallow an unexpected thrown error, and does not retry it", async () => {
    rpc.mockRejectedValue(new Error("network exploded"));

    await expect(ensureProfileForCurrentUser()).rejects.toThrow("network exploded");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
