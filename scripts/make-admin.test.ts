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
});
