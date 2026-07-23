import { describe, it, expect, vi, beforeEach } from "vitest";

const signInEmail = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  auth: {
    signIn: {
      email: (...args: unknown[]) => signInEmail(...args),
    },
  },
}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

// Regression guard for the production bug: loginAction must never reach
// into profile provisioning/lookup at all — importing these modules here
// (rather than mocking them) means a regression that re-adds a call would
// either show up as a real network attempt (test hangs/throws) or, if
// someone re-adds the import, these spies would be pointless — so the
// real proof is `never toHaveBeenCalled()` combined with the source not
// importing them (see login.ts's diff). Mocked anyway for isolation.
const ensureProfileForCurrentUser = vi.fn();
vi.mock("@/features/auth/server/ensure-profile", () => ({
  ensureProfileForCurrentUser: (...args: unknown[]) => ensureProfileForCurrentUser(...args),
}));

const getCurrentProfile = vi.fn();
vi.mock("@/features/auth/server/get-current-profile", () => ({
  getCurrentProfile: (...args: unknown[]) => getCurrentProfile(...args),
}));

const { loginAction } = await import("./login");

describe("loginAction", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    redirectMock.mockClear();
    ensureProfileForCurrentUser.mockClear();
    getCurrentProfile.mockClear();
  });

  it("returns a generic error for invalid input without calling signIn", async () => {
    const result = await loginAction({ email: "not-an-email", password: "" });
    expect(result?.error).toBeTruthy();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("returns a generic error when sign-in fails, without redirecting", async () => {
    signInEmail.mockResolvedValue({ data: null, error: { message: "invalid credentials" } });

    const result = await loginAction({ email: "a@b.com", password: "wrong-password" });

    expect(result?.error).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /auth/complete on success, without touching provisioning or profile lookup", async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await expect(loginAction({ email: "a@b.com", password: "correct-password" })).rejects.toThrow(
      "REDIRECT:/auth/complete"
    );

    expect(ensureProfileForCurrentUser).not.toHaveBeenCalled();
    expect(getCurrentProfile).not.toHaveBeenCalled();
  });

  it("forwards a sanitized next path to the completion route", async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await expect(
      loginAction({ email: "a@b.com", password: "correct-password" }, "/app/tickets/new")
    ).rejects.toThrow(`REDIRECT:/auth/complete?next=${encodeURIComponent("/app/tickets/new")}`);
  });

  it("drops an unsafe next target instead of forwarding it", async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await expect(
      loginAction({ email: "a@b.com", password: "correct-password" }, "https://evil.example.com")
    ).rejects.toThrow("REDIRECT:/auth/complete");

    const redirectedUrl = redirectMock.mock.calls[0]?.[0] as string;
    expect(redirectedUrl).not.toContain("evil.example.com");
    expect(redirectedUrl).not.toContain("?next=");
  });
});
