import { describe, expect, it, vi } from "vitest";
import {
  parseArgs,
  checkRequiredEnvVars,
  fetchBranchInfo,
  assertBranchAllowedForEnv,
  confirmationPhrase,
  matchesConfirmationPhrase,
  lookupProfile,
  decideMutation,
  promoteProfileToAdmin,
  performPromotion,
  formatFailureMessage,
  OperatorError,
  type QueryClient,
} from "./make-admin-core";

describe("parseArgs", () => {
  it("rejects a missing --env", () => {
    expect(() => parseArgs(["--user-id=abc"])).toThrow(/--env is required/);
  });

  it("rejects an invalid --env", () => {
    expect(() => parseArgs(["--env=staging", "--user-id=abc"])).toThrow(/--env is required/);
  });

  it("rejects a missing --user-id", () => {
    expect(() => parseArgs(["--env=development"])).toThrow(/--user-id is required/);
  });

  it("accepts a valid --env=development", () => {
    expect(parseArgs(["--env=development", "--user-id=abc"])).toEqual({
      env: "development",
      userId: "abc",
      dryRun: false,
    });
  });

  it("accepts a valid --env=production", () => {
    expect(parseArgs(["--env=production", "--user-id=abc"])).toEqual({
      env: "production",
      userId: "abc",
      dryRun: false,
    });
  });

  it("sets dryRun when --dry-run is present", () => {
    expect(parseArgs(["--env=production", "--user-id=abc", "--dry-run"]).dryRun).toBe(true);
  });

  it("rejects --role outright, regardless of --env/--user-id validity", () => {
    expect(() => parseArgs(["--env=development", "--user-id=abc", "--role=admin"])).toThrow(/--role is not a supported/);
  });

  it("rejects --email outright", () => {
    expect(() => parseArgs(["--env=development", "--email=a@b.com"])).toThrow(/--email is not supported/);
  });

  it("every rejection is an OperatorError (safe to print verbatim)", () => {
    try {
      parseArgs([]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(OperatorError);
    }
  });
});

describe("checkRequiredEnvVars", () => {
  const full = {
    NEON_API_KEY: "k",
    NEON_PROJECT_ID: "p",
    NEON_BRANCH_ID: "b",
    DATABASE_MIGRATION_URL: "postgresql://x",
  };

  it("passes when all four are set", () => {
    expect(() => checkRequiredEnvVars(full)).not.toThrow();
  });

  function withoutKey(key: keyof typeof full): Record<string, string> {
    const rest: Record<string, string> = { ...full };
    delete rest[key];
    return rest;
  }

  it("rejects when NEON_API_KEY is missing", () => {
    expect(() => checkRequiredEnvVars(withoutKey("NEON_API_KEY"))).toThrow(/NEON_API_KEY/);
  });

  it("rejects when NEON_PROJECT_ID is missing", () => {
    expect(() => checkRequiredEnvVars(withoutKey("NEON_PROJECT_ID"))).toThrow(/NEON_PROJECT_ID/);
  });

  it("rejects when NEON_BRANCH_ID is missing", () => {
    expect(() => checkRequiredEnvVars(withoutKey("NEON_BRANCH_ID"))).toThrow(/NEON_BRANCH_ID/);
  });

  it("rejects when DATABASE_MIGRATION_URL is missing even if DATABASE_URL is set (no fallback)", () => {
    expect(() =>
      checkRequiredEnvVars({ ...withoutKey("DATABASE_MIGRATION_URL"), DATABASE_URL: "postgresql://pooled-runtime-connection" })
    ).toThrow(/DATABASE_MIGRATION_URL/);
  });

  it("the error message names only variable names, never a value", () => {
    try {
      checkRequiredEnvVars({});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(OperatorError);
      expect((error as Error).message).not.toMatch(/postgresql:\/\//);
    }
  });
});

describe("fetchBranchInfo", () => {
  function fakeFetch(status: number, body: unknown = {}) {
    return vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  it("returns branch name/default on success", async () => {
    const result = await fetchBranchInfo(
      fakeFetch(200, { branch: { name: "servicedesk-lite-dev", default: false } }),
      "key",
      "proj",
      "branch"
    );
    expect(result).toEqual({ name: "servicedesk-lite-dev", default: false });
  });

  it("rejects on HTTP 401", async () => {
    await expect(fetchBranchInfo(fakeFetch(401), "key", "proj", "branch")).rejects.toThrow(/HTTP 401/);
  });

  it("rejects on HTTP 404", async () => {
    await expect(fetchBranchInfo(fakeFetch(404), "key", "proj", "branch")).rejects.toThrow(/HTTP 404/);
  });

  it("rejects on HTTP 500", async () => {
    await expect(fetchBranchInfo(fakeFetch(500), "key", "proj", "branch")).rejects.toThrow(/HTTP 500/);
  });
});

describe("assertBranchAllowedForEnv", () => {
  it("allows development + servicedesk-lite-dev + non-default", () => {
    expect(() =>
      assertBranchAllowedForEnv("development", { name: "servicedesk-lite-dev", default: false })
    ).not.toThrow();
  });

  it("rejects development when the branch is default", () => {
    expect(() => assertBranchAllowedForEnv("development", { name: "servicedesk-lite-dev", default: true })).toThrow(
      /default\/production/
    );
  });

  it("rejects development against a differently-named branch", () => {
    expect(() => assertBranchAllowedForEnv("development", { name: "some-other-branch", default: false })).toThrow(
      /servicedesk-lite-dev/
    );
  });

  it("allows production when the branch is default", () => {
    expect(() => assertBranchAllowedForEnv("production", { name: "main", default: true })).not.toThrow();
  });

  it("rejects production when the branch is not default", () => {
    expect(() => assertBranchAllowedForEnv("production", { name: "servicedesk-lite-dev", default: false })).toThrow(
      /requires the default\/production branch/
    );
  });
});

describe("confirmationPhrase / matchesConfirmationPhrase", () => {
  it("uses distinct phrases per environment", () => {
    expect(confirmationPhrase("production")).toBe("PROMOTE PRODUCTION ADMIN");
    expect(confirmationPhrase("development")).toBe("PROMOTE DEVELOPMENT ADMIN");
    expect(confirmationPhrase("production")).not.toBe(confirmationPhrase("development"));
  });

  it("matches only the exact phrase for the given env", () => {
    expect(matchesConfirmationPhrase("PROMOTE PRODUCTION ADMIN", "production")).toBe(true);
    expect(matchesConfirmationPhrase("PROMOTE DEVELOPMENT ADMIN", "production")).toBe(false);
    expect(matchesConfirmationPhrase("yes", "production")).toBe(false);
    expect(matchesConfirmationPhrase("promote production admin", "production")).toBe(false);
  });

  it("tolerates only surrounding whitespace", () => {
    expect(matchesConfirmationPhrase("  PROMOTE PRODUCTION ADMIN  ", "production")).toBe(true);
  });
});

function fakeClient(rowsByCall: Array<{ rows: unknown[] }>): { client: QueryClient; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn();
  for (const result of rowsByCall) {
    query.mockResolvedValueOnce(result);
  }
  return { client: { query }, query };
}

describe("lookupProfile", () => {
  it("reports missing when no row is found", async () => {
    const { client, query } = fakeClient([{ rows: [] }]);
    expect(await lookupProfile(client, "user-1")).toEqual({ exists: false, role: null });
    expect(query.mock.calls[0][0]).toMatch(/SELECT role FROM public\.profiles WHERE id = \$1/);
    expect(query.mock.calls[0][1]).toEqual(["user-1"]);
  });

  it("reports the existing role", async () => {
    const { client } = fakeClient([{ rows: [{ role: "employee" }] }]);
    expect(await lookupProfile(client, "user-1")).toEqual({ exists: true, role: "employee" });
  });

  it("never interpolates the user id into the SQL text", async () => {
    const { client, query } = fakeClient([{ rows: [] }]);
    await lookupProfile(client, "totally-unique-id-xyz");
    expect(String(query.mock.calls[0][0])).not.toContain("totally-unique-id-xyz");
  });
});

describe("decideMutation", () => {
  it("errors when the profile is missing", () => {
    expect(decideMutation({ exists: false, role: null })).toEqual({ kind: "error", reason: "missing-profile" });
  });

  it("no-ops when already admin", () => {
    expect(decideMutation({ exists: true, role: "admin" })).toEqual({ kind: "noop", reason: "already-admin" });
  });

  it("promotes an employee profile", () => {
    expect(decideMutation({ exists: true, role: "employee" })).toEqual({ kind: "promote" });
  });
});

describe("promoteProfileToAdmin", () => {
  it("calls private.set_profile_role with a parameterized query", async () => {
    const { client, query } = fakeClient([{ rows: [{}] }]);
    await promoteProfileToAdmin(client, "user-42");
    expect(query.mock.calls[0][0]).toMatch(/private\.set_profile_role\(\$1, 'admin'::public\.user_role\)/);
    expect(query.mock.calls[0][1]).toEqual(["user-42"]);
    expect(String(query.mock.calls[0][0])).not.toContain("user-42");
  });
});

describe("performPromotion", () => {
  it("throws for a missing profile and never calls the client", async () => {
    const { client, query } = fakeClient([]);
    const confirm = vi.fn();
    await expect(
      performPromotion({ client, userId: "x", decision: { kind: "error", reason: "missing-profile" }, confirm })
    ).rejects.toThrow(OperatorError);
    expect(query).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("returns noop for an already-admin profile and never calls the client", async () => {
    const { client, query } = fakeClient([]);
    const confirm = vi.fn();
    const result = await performPromotion({
      client,
      userId: "x",
      decision: { kind: "noop", reason: "already-admin" },
      confirm,
    });
    expect(result).toBe("noop");
    expect(query).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("promotes after a truthy confirm()", async () => {
    const { client, query } = fakeClient([{ rows: [{}] }]);
    const confirm = vi.fn().mockResolvedValue(true);
    const result = await performPromotion({ client, userId: "x", decision: { kind: "promote" }, confirm });
    expect(result).toBe("promoted");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("aborts without mutating when confirm() resolves false (wrong phrase)", async () => {
    const { client, query } = fakeClient([]);
    const confirm = vi.fn().mockResolvedValue(false);
    await expect(performPromotion({ client, userId: "x", decision: { kind: "promote" }, confirm })).rejects.toThrow(
      /confirmation phrase did not match/
    );
    expect(query).not.toHaveBeenCalled();
  });
});

describe("formatFailureMessage", () => {
  it("prints an OperatorError's own message verbatim (it is always PII-free by construction)", () => {
    expect(formatFailureMessage(new OperatorError("Refusing to continue: something specific."))).toBe(
      "make-admin failed: Refusing to continue: something specific."
    );
  });

  it("never prints a plain Error's .message, even if it contains sensitive-looking content", () => {
    const message = formatFailureMessage(
      new Error("connection to server at \"ep-secret-host.neon.tech\" failed for user id abc-123")
    );
    expect(message).not.toContain("ep-secret-host");
    expect(message).not.toContain("abc-123");
  });

  it("surfaces only the SQLSTATE code for a driver-style error, never the message", () => {
    const pgError = Object.assign(new Error("No profiles row for id abc-123 (has this user actually signed in?)"), {
      code: "P0002",
    });
    const message = formatFailureMessage(pgError);
    expect(message).toContain("P0002");
    expect(message).not.toContain("abc-123");
  });

  it("handles a non-Error thrown value without printing it", () => {
    expect(formatFailureMessage("raw string throw containing secret-abc")).not.toContain("secret-abc");
  });
});
