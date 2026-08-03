import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The mocked Neon Auth middleware's *decision* for a given request —
// exactly what src/proxy.ts wraps and never re-implements (see the
// module's own comment: this proxy is a UX shortcut, not the authorization
// boundary).
const middlewareImpl = vi.fn();
const middlewareFactory = vi.fn(() => middlewareImpl);
vi.mock("@/lib/auth/server", () => ({
  auth: { middleware: () => middlewareFactory() },
}));

const { default: proxy } = await import("./proxy");

function makeRequest(path: string, init?: { method?: string; headers?: Record<string, string> }): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), init);
}

function allowResponse(): NextResponse {
  return NextResponse.next();
}

function loginRedirectResponse(): NextResponse {
  return NextResponse.redirect(new URL("/login", "http://localhost:3000"), 307);
}

describe("proxy", () => {
  beforeEach(() => {
    middlewareImpl.mockReset();
    middlewareFactory.mockClear();
  });

  it("anonymous GET /app redirects to /login", async () => {
    middlewareImpl.mockResolvedValue(loginRedirectResponse());

    const res = await proxy(makeRequest("/app"));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("anonymous GET /admin redirects to /login", async () => {
    middlewareImpl.mockResolvedValue(loginRedirectResponse());

    const res = await proxy(makeRequest("/admin"));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("a protected GET still goes through Neon Auth middleware", async () => {
    middlewareImpl.mockResolvedValue(allowResponse());

    const request = makeRequest("/app/tickets");
    await proxy(request);

    expect(middlewareImpl).toHaveBeenCalledTimes(1);
    expect(middlewareImpl).toHaveBeenCalledWith(request);
  });

  it("a confirmed Server Action POST is passed through to the action without invoking Neon Auth middleware", async () => {
    const request = makeRequest("/app/tickets/new", {
      method: "POST",
      headers: { "next-action": "abc123action" },
    });

    const res = await proxy(request);

    expect(middlewareImpl).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBeNull();
  });

  it("an ordinary POST without the Server Action marker does not get the bypass", async () => {
    middlewareImpl.mockResolvedValue(allowResponse());

    const request = makeRequest("/app/tickets/new", { method: "POST" });
    await proxy(request);

    expect(middlewareImpl).toHaveBeenCalledTimes(1);
    expect(middlewareImpl).toHaveBeenCalledWith(request);
  });

  it("preserves a sanitized next path on the login redirect", async () => {
    middlewareImpl.mockResolvedValue(loginRedirectResponse());

    const res = await proxy(makeRequest("/app/tickets/new"));

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/app/tickets/new");
  });

  it("never carries an external URL through as the next path", async () => {
    middlewareImpl.mockResolvedValue(loginRedirectResponse());

    // Even though the matcher (config.matcher below) only ever routes
    // /app/** and /admin/** requests here in production, this proxy derives
    // `next` solely from the request's own pathname via sanitizeNextPath()
    // — never from a client-supplied header/query value — so there is no
    // path through which an external URL could reach the redirect's `next`.
    const res = await proxy(makeRequest("/app/tickets/new?next=https://evil.example.com"));

    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("next")).toBe("/app/tickets/new");
    expect(location.search).not.toContain("evil.example.com");
  });
});
