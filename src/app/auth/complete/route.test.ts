import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const signOut = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  auth: { signOut: (...args: unknown[]) => signOut(...args) },
}));

const getCurrentUser = vi.fn();
vi.mock("@/features/auth/server/get-current-user", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

const ensureProfileForCurrentUser = vi.fn();
vi.mock("@/features/auth/server/ensure-profile", () => ({
  ensureProfileForCurrentUser: (...args: unknown[]) => ensureProfileForCurrentUser(...args),
}));

const getCurrentProfile = vi.fn();
vi.mock("@/features/auth/server/get-current-profile", () => ({
  getCurrentProfile: (...args: unknown[]) => getCurrentProfile(...args),
}));

const { GET } = await import("./route");

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

function activeProfile(role: "employee" | "admin") {
  return { id: "u1", fullName: "Test User", role, department: null, isActive: true };
}

describe("GET /auth/complete", () => {
  beforeEach(() => {
    signOut.mockReset();
    getCurrentUser.mockReset();
    ensureProfileForCurrentUser.mockReset();
    getCurrentProfile.mockReset();
  });

  it("redirects to /login when the session cookie has not arrived yet", async () => {
    getCurrentUser.mockResolvedValue(null);

    const res = await GET(makeRequest("/auth/complete"));

    expect(res.headers.get("location")).toMatch(/\/login$/);
    expect(ensureProfileForCurrentUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("uninvited account: signs out and redirects to /unauthorized, never reaching profile lookup", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    ensureProfileForCurrentUser.mockResolvedValue(false);

    const res = await GET(makeRequest("/auth/complete"));

    expect(ensureProfileForCurrentUser).toHaveBeenCalledTimes(1);
    expect(getCurrentProfile).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.headers.get("location")).toMatch(/\/unauthorized$/);
  });

  it("provisioning reports success but no profile is visible: signs out and redirects to /unauthorized", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    ensureProfileForCurrentUser.mockResolvedValue(true);
    getCurrentProfile.mockResolvedValue(null);

    const res = await GET(makeRequest("/auth/complete"));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.headers.get("location")).toMatch(/\/unauthorized$/);
  });

  it("inactive profile: redirects to /unauthorized", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    ensureProfileForCurrentUser.mockResolvedValue(true);
    getCurrentProfile.mockResolvedValue({ ...activeProfile("employee"), isActive: false });

    const res = await GET(makeRequest("/auth/complete"));

    expect(res.headers.get("location")).toMatch(/\/unauthorized$/);
  });

  it("newly invited employee: provisioning succeeds and redirects to /app", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    ensureProfileForCurrentUser.mockResolvedValue(true);
    getCurrentProfile.mockResolvedValue(activeProfile("employee"));

    const res = await GET(makeRequest("/auth/complete"));

    expect(res.headers.get("location")).toMatch(/\/app$/);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("admin: redirects to /admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    ensureProfileForCurrentUser.mockResolvedValue(true);
    getCurrentProfile.mockResolvedValue(activeProfile("admin"));

    const res = await GET(makeRequest("/auth/complete"));

    expect(res.headers.get("location")).toMatch(/\/admin$/);
  });

  it("preserves a safe next path within the caller's section", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    ensureProfileForCurrentUser.mockResolvedValue(true);
    getCurrentProfile.mockResolvedValue(activeProfile("employee"));

    const res = await GET(makeRequest(`/auth/complete?next=${encodeURIComponent("/app/tickets/new")}`));

    expect(res.headers.get("location")).toMatch(/\/app\/tickets\/new$/);
  });

  it("drops an unsafe next target and falls back to the role home page", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    ensureProfileForCurrentUser.mockResolvedValue(true);
    getCurrentProfile.mockResolvedValue(activeProfile("employee"));

    const res = await GET(makeRequest(`/auth/complete?next=${encodeURIComponent("https://evil.example.com")}`));

    expect(res.headers.get("location")).not.toContain("evil.example.com");
    expect(res.headers.get("location")).toMatch(/\/app$/);
  });

  it("existing employee: repeat visits stay idempotent (no duplicate side effects observable here)", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    ensureProfileForCurrentUser.mockResolvedValue(true); // ensure_profile()'s own idempotent early-return
    getCurrentProfile.mockResolvedValue(activeProfile("employee"));

    const first = await GET(makeRequest("/auth/complete"));
    const second = await GET(makeRequest("/auth/complete"));

    expect(first.headers.get("location")).toMatch(/\/app$/);
    expect(second.headers.get("location")).toMatch(/\/app$/);
    expect(ensureProfileForCurrentUser).toHaveBeenCalledTimes(2);
  });
});
