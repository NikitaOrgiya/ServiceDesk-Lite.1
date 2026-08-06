import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const signInEmail = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  auth: { signIn: { email: (...args: unknown[]) => signInEmail(...args) } },
}));

const { POST } = await import("./route");

function makeRequest(body: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:3000/auth/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

describe("POST /auth/login", () => {
  beforeEach(() => {
    signInEmail.mockReset();
  });

  it("rejects invalid input without calling signIn", async () => {
    const res = await POST(makeRequest({ email: "not-an-email", password: "" }));

    expect(signInEmail).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/login\?error=1$/);
  });

  it("redirects to /login with a generic error on failed sign-in, never reflecting the reason", async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });

    const res = await POST(makeRequest({ email: "a@b.com", password: "wrong-password" }));

    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toMatch(/\/login\?error=1$/);
    expect(location).not.toContain("Invalid login credentials");
    expect(location).not.toContain("wrong-password");
  });

  it("redirects to /auth/complete (not directly to /app or /admin) on success", async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await POST(makeRequest({ email: "a@b.com", password: "correct-password" }));

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/auth\/complete$/);
  });

  it("forwards a safe next path to the completion route", async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await POST(
      makeRequest({ email: "a@b.com", password: "correct-password", next: "/app/tickets" })
    );

    expect(res.headers.get("location")).toMatch(/\/auth\/complete\?next=%2Fapp%2Ftickets$/);
  });

  it("drops an unsafe next target instead of forwarding it", async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await POST(
      makeRequest({
        email: "a@b.com",
        password: "correct-password",
        next: "https://evil.example.com",
      })
    );

    const location = res.headers.get("location")!;
    expect(location).toMatch(/\/auth\/complete$/);
    expect(location).not.toContain("evil.example.com");
  });
});
