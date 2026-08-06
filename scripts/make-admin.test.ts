import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Side-effecting in the real script (loads .env.local via @next/env) — a
// no-op stand-in so tests never depend on, or pollute, the real environment.
vi.mock("../envConfig", () => ({}));

const connect = vi.fn().mockResolvedValue(undefined);
const end = vi.fn().mockResolvedValue(undefined);
const query = vi.fn();
// A plain function, not an arrow function: `new ClientMock()` (as the real
// script does) requires something JS can actually call as a constructor.
const ClientMock = vi.fn().mockImplementation(function FakeClient() {
  return { connect, end, query };
});

vi.mock("@neondatabase/serverless", () => ({
  Client: ClientMock,
  neonConfig: {},
}));

vi.mock("ws", () => ({ default: {} }));

let questionAnswer = "";
const question = vi.fn(async () => questionAnswer);
const closeInterface = vi.fn();
vi.mock("node:readline/promises", () => ({
  default: { createInterface: () => ({ question, close: closeInterface }) },
}));

const { main } = await import("./make-admin");

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_ARGV = [...process.argv];
const ENV_KEYS = ["NEON_API_KEY", "NEON_PROJECT_ID", "NEON_BRANCH_ID", "DATABASE_MIGRATION_URL", "DATABASE_URL"];

function setArgs(args: string[]) {
  process.argv = [...ORIGINAL_ARGV.slice(0, 2), ...args];
}

function setEnv(vars: Record<string, string>) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, vars);
}

const FULL_ENV = {
  NEON_API_KEY: "test-key",
  NEON_PROJECT_ID: "test-project",
  NEON_BRANCH_ID: "test-branch",
  DATABASE_MIGRATION_URL: "postgresql://migration-session",
};

function mockBranch(overrides: Partial<{ name: string; default: boolean }> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ branch: { name: "servicedesk-lite-dev", default: false, ...overrides } }),
    })
  );
}

describe("make-admin main()", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    connect.mockClear();
    end.mockClear();
    query.mockReset();
    ClientMock.mockClear();
    question.mockClear();
    closeInterface.mockClear();
    questionAnswer = "";
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.argv = [...ORIGINAL_ARGV];
    vi.unstubAllGlobals();
    logSpy.mockRestore();
  });

  it("--dry-run never calls private.set_profile_role", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] });
    setArgs(["--env=development", "--user-id=abc", "--dry-run"]);

    await main();

    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toMatch(/SELECT role FROM public\.profiles/);
    expect(question).not.toHaveBeenCalled();
  });

  it("--dry-run prints only generic exists/role/mutation-required output", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] });
    setArgs(["--env=development", "--user-id=super-secret-id", "--dry-run"]);

    await main();

    const printed = logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(printed).toMatch(/exists/);
    expect(printed).toMatch(/employee/);
    expect(printed).toMatch(/required/);
    expect(printed).not.toContain("super-secret-id");
  });

  it("missing profile does not mutate and rejects with a generic error", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [] });
    setArgs(["--env=development", "--user-id=abc"]);

    await expect(main()).rejects.toThrow(/no matching profile/i);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("employee profile mutates only after the correct development confirmation phrase", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] }).mockResolvedValueOnce({ rows: [{}] });
    questionAnswer = "PROMOTE DEVELOPMENT ADMIN";
    setArgs(["--env=development", "--user-id=abc"]);

    await main();

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][0])).toMatch(/set_profile_role/);
  });

  it("employee profile on production requires the production phrase specifically", async () => {
    setEnv(FULL_ENV);
    mockBranch({ default: true, name: "production" });
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] });
    questionAnswer = "PROMOTE DEVELOPMENT ADMIN"; // wrong phrase for production
    setArgs(["--env=production", "--user-id=abc"]);

    await expect(main()).rejects.toThrow(/confirmation phrase did not match/i);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("admin profile does not call set_profile_role again and needs no confirmation", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [{ role: "admin" }] });
    setArgs(["--env=development", "--user-id=abc"]);

    await main();

    expect(query).toHaveBeenCalledTimes(1);
    expect(question).not.toHaveBeenCalled();
  });

  it("an incorrect confirmation phrase cancels the operation without mutating", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] });
    questionAnswer = "yes";
    setArgs(["--env=development", "--user-id=abc"]);

    await expect(main()).rejects.toThrow(/confirmation phrase did not match/i);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("DATABASE_URL alone (without DATABASE_MIGRATION_URL) is not sufficient", async () => {
    setEnv({
      NEON_API_KEY: "k",
      NEON_PROJECT_ID: "p",
      NEON_BRANCH_ID: "b",
      DATABASE_URL: "postgresql://pooled-runtime-connection",
    });
    setArgs(["--env=development", "--user-id=abc"]);

    await expect(main()).rejects.toThrow(/DATABASE_MIGRATION_URL/);
    expect(ClientMock).not.toHaveBeenCalled();
  });

  it("every query call is parameterized — the user id never appears in SQL text", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] }).mockResolvedValueOnce({ rows: [{}] });
    questionAnswer = "PROMOTE DEVELOPMENT ADMIN";
    setArgs(["--env=development", "--user-id=distinctive-user-id-42"]);

    await main();

    for (const call of query.mock.calls) {
      expect(String(call[0])).not.toContain("distinctive-user-id-42");
    }
    expect(query.mock.calls[1][1]).toEqual(["distinctive-user-id-42"]);
  });

  it("stdout/stderr never contain the passed --user-id, even on failure", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [] }); // missing profile -> throws
    setArgs(["--env=development", "--user-id=super-secret-id-999"]);

    let caught: unknown;
    try {
      await main();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toContain("super-secret-id-999");
    const printed = logSpy.mock.calls.flat().map(String).join("\n");
    expect(printed).not.toContain("super-secret-id-999");
  });

  it("rejects a development target that is actually the default/production branch", async () => {
    setEnv(FULL_ENV);
    mockBranch({ default: true, name: "production" });
    setArgs(["--env=development", "--user-id=abc"]);

    await expect(main()).rejects.toThrow(/default\/production/);
    expect(ClientMock).not.toHaveBeenCalled();
  });

  it("rejects a production target that is not the default branch", async () => {
    setEnv(FULL_ENV);
    mockBranch({ default: false, name: "servicedesk-lite-dev" });
    setArgs(["--env=production", "--user-id=abc"]);

    await expect(main()).rejects.toThrow(/requires the default\/production branch/);
    expect(ClientMock).not.toHaveBeenCalled();
  });

  it("closes the database client even when the mutation is rejected", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [] });
    setArgs(["--env=development", "--user-id=abc"]);

    await expect(main()).rejects.toThrow();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("successful production dry-run reports its summary and never prompts or mutates", async () => {
    setEnv(FULL_ENV);
    mockBranch({ default: true, name: "production" });
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] });
    setArgs(["--env=production", "--user-id=abc", "--dry-run"]);

    await main();

    expect(query).toHaveBeenCalledTimes(1);
    expect(question).not.toHaveBeenCalled();
    const printed = logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(printed).toMatch(/required/);
  });

  it("interactive production confirmation succeeds with the exact production phrase", async () => {
    setEnv(FULL_ENV);
    mockBranch({ default: true, name: "production" });
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] }).mockResolvedValueOnce({ rows: [{}] });
    questionAnswer = "PROMOTE PRODUCTION ADMIN";
    setArgs(["--env=production", "--user-id=abc"]);

    await main();

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][0])).toMatch(/set_profile_role/);
    const printed = logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(printed).toMatch(/promoted/i);
  });

  it("readline is created and closed exactly once for a single interactive confirmation", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] }).mockResolvedValueOnce({ rows: [{}] });
    questionAnswer = "PROMOTE DEVELOPMENT ADMIN";
    setArgs(["--env=development", "--user-id=abc"]);

    await main();

    expect(question).toHaveBeenCalledTimes(1);
    expect(closeInterface).toHaveBeenCalledTimes(1);
  });

  it("readline still closes exactly once when the typed phrase is wrong", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] });
    questionAnswer = "nope";
    setArgs(["--env=development", "--user-id=abc"]);

    await expect(main()).rejects.toThrow();

    expect(closeInterface).toHaveBeenCalledTimes(1);
  });

  it("client.end() runs exactly once on the success path and completes before main() resolves", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [{ role: "admin" }] });
    setArgs(["--env=development", "--user-id=abc"]);

    let endResolved = false;
    end.mockImplementationOnce(async () => {
      await Promise.resolve();
      await Promise.resolve();
      endResolved = true;
    });

    await main();

    expect(end).toHaveBeenCalledTimes(1);
    expect(endResolved).toBe(true);
  });

  it("a cleanup-stage failure after a successful mutation is reported as a warning, not as main() rejecting", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] }).mockResolvedValueOnce({ rows: [{}] });
    questionAnswer = "PROMOTE DEVELOPMENT ADMIN";
    setArgs(["--env=development", "--user-id=abc"]);
    end.mockRejectedValueOnce(
      Object.assign(new Error('Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c'), {})
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(main()).resolves.toBeUndefined();

    const printed = logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(printed).toMatch(/promoted/i);
    const printedErr = errorSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(printedErr).toMatch(/cleanup-failed/);
    expect(printedErr).not.toContain("UV_HANDLE_CLOSING");
    errorSpy.mockRestore();
  });

  it("a cleanup-stage failure after a missing-profile error still surfaces the original error, not the cleanup one", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockResolvedValueOnce({ rows: [] });
    setArgs(["--env=development", "--user-id=abc"]);
    end.mockRejectedValueOnce(new Error("handle already closing"));

    await expect(main()).rejects.toThrow(/no matching profile/i);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("Management API failure is tagged with the branch-validation-failed stage", async () => {
    setEnv(FULL_ENV);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND console.neon.tech")));
    setArgs(["--env=development", "--user-id=abc"]);

    let caught: unknown;
    try {
      await main();
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ stage: "branch-validation-failed" });
    expect((caught as Error).message).not.toContain("ENOTFOUND");
    expect(ClientMock).not.toHaveBeenCalled();
  });

  it("a database connect failure is tagged with the database-connect-failed stage", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    connect.mockRejectedValueOnce(Object.assign(new Error("connection to server at \"ep-secret-host.neon.tech\" failed"), { code: "ECONNREFUSED" }));
    setArgs(["--env=development", "--user-id=abc"]);

    let caught: unknown;
    try {
      await main();
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ stage: "database-connect-failed" });
    expect((caught as Error).message).not.toContain("ep-secret-host");
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("a profile lookup failure is tagged with the profile-lookup-failed stage", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockRejectedValueOnce(Object.assign(new Error("relation public.profiles does not exist"), { code: "42P01" }));
    setArgs(["--env=development", "--user-id=abc"]);

    let caught: unknown;
    try {
      await main();
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ stage: "profile-lookup-failed" });
    expect((caught as Error).message).toContain("42P01");
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("a mutation failure is tagged with the promotion-failed stage", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query
      .mockResolvedValueOnce({ rows: [{ role: "employee" }] })
      .mockRejectedValueOnce(Object.assign(new Error("deadlock detected for user abc-123"), { code: "40P01" }));
    questionAnswer = "PROMOTE DEVELOPMENT ADMIN";
    setArgs(["--env=development", "--user-id=abc-123"]);

    let caught: unknown;
    try {
      await main();
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ stage: "promotion-failed" });
    expect((caught as Error).message).not.toContain("abc-123");
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("no unknown Error.message ever reaches stdout or stderr", async () => {
    setEnv(FULL_ENV);
    mockBranch();
    query.mockRejectedValueOnce(new Error("super-secret-diagnostic-detail-should-never-print"));
    setArgs(["--env=development", "--user-id=abc"]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await main();
    } catch {
      // formatFailureMessage(error) is what the real entrypoint prints on rejection.
    }

    const printedLog = logSpy.mock.calls.flat().map(String).join("\n");
    const printedErr = errorSpy.mock.calls.flat().map(String).join("\n");
    expect(printedLog).not.toContain("super-secret-diagnostic-detail-should-never-print");
    expect(printedErr).not.toContain("super-secret-diagnostic-detail-should-never-print");
    errorSpy.mockRestore();
  });

  it("simulated full Windows-terminal interactive flow closes readline and the client exactly once each", async () => {
    setEnv(FULL_ENV);
    mockBranch({ default: true, name: "production" });
    query.mockResolvedValueOnce({ rows: [{ role: "employee" }] }).mockResolvedValueOnce({ rows: [{}] });
    questionAnswer = "PROMOTE PRODUCTION ADMIN";
    setArgs(["--env=production", "--user-id=abc"]);

    await main();

    expect(question).toHaveBeenCalledTimes(1);
    expect(closeInterface).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(ClientMock).toHaveBeenCalledTimes(1);
  });

  it("the real entrypoint never calls process.exit() (uses process.exitCode instead)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(path.join(import.meta.dirname, "make-admin.ts"), "utf8");
    // Strip /** ... */ block comments first — this file's own docstring
    // explains, in prose, why `process.exit()` is no longer called, which
    // would otherwise trip up a naive source-text search for the phrase.
    const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutBlockComments).not.toMatch(/\bprocess\.exit\(/);
    expect(withoutBlockComments).toMatch(/process\.exitCode\s*=/);
  });
});
