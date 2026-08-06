import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const signOut = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  auth: { signOut: (...args: unknown[]) => signOut(...args) },
}));

const { POST } = await import("./route");

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/auth/logout", {
    method: "POST",
    headers,
  });
}

describe("POST /auth/logout", () => {
  beforeEach(() => {
    signOut.mockReset();
  });

  it("signs out and redirects to /login for a same-origin request", async () => {
    signOut.mockResolvedValue({ error: null });

    const res = await POST(makeRequest({ origin: "http://localhost:3000", host: "localhost:3000" }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/login$/);
  });

  it("signs out and redirects to /login when no Origin header is sent", async () => {
    signOut.mockResolvedValue({ error: null });

    const res = await POST(makeRequest({ host: "localhost:3000" }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.headers.get("location")).toMatch(/\/login$/);
  });

  // CSRF guard: Next.js applies this Origin-vs-Host check to Server
  // Actions automatically; a plain Route Handler has to do it itself (see
  // route.ts).
  it("rejects a cross-origin POST without calling signOut", async () => {
    const res = await POST(
      makeRequest({ origin: "https://evil.example.com", host: "localhost:3000" })
    );

    expect(signOut).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it("still redirects to /login even when signOut itself reports an error", async () => {
    signOut.mockResolvedValue({ error: { message: "boom" } });

    const res = await POST(makeRequest({ origin: "http://localhost:3000", host: "localhost:3000" }));

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/login$/);
  });
});
