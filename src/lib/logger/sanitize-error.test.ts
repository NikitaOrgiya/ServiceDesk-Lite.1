import { describe, expect, it } from "vitest";

import { sanitizeError } from "@/lib/logger/sanitize-error";

describe("sanitizeError", () => {
  it("extracts message/code/details/hint from a Supabase-like error", () => {
    const result = sanitizeError({
      message: "Row not found",
      code: "PGRST116",
      details: "0 rows returned",
      hint: "Check the ticket id",
    });

    expect(result).toEqual({
      message: "Row not found",
      code: "PGRST116",
      details: "0 rows returned",
      hint: "Check the ticket id",
    });
  });

  it("handles a native Error instance", () => {
    const result = sanitizeError(new Error("boom"));
    expect(result.message).toBe("boom");
    expect(result.code).toBeUndefined();
  });

  it("handles a string error", () => {
    const result = sanitizeError("something failed");
    expect(result.message).toBe("something failed");
  });

  it("falls back to a generic message for a completely unknown error shape", () => {
    expect(sanitizeError(42)).toEqual({ message: "Unknown error" });
    expect(sanitizeError(undefined)).toEqual({ message: "Unknown error" });
    expect(sanitizeError(null)).toEqual({ message: "Unknown error" });
  });

  it("redacts access tokens embedded in an error message", () => {
    const result = sanitizeError({
      message: "Request failed with access_token=abc123.def456",
    });
    expect(result.message).not.toContain("abc123");
    expect(result.message).toContain("[redacted]");
  });

  it("redacts cookie and password mentions", () => {
    const result = sanitizeError({
      message: "Invalid cookie header, password mismatch",
    });
    expect(result.message).toBe("Invalid [redacted] header, [redacted] mismatch");
  });

  it("redacts a bearer authorization value", () => {
    const result = sanitizeError({
      message: "Authorization: Bearer sb-abc.def.ghi rejected",
    });
    expect(result.message).not.toContain("sb-abc.def.ghi");
  });

  it("never returns non-string fields from the original object", () => {
    const result = sanitizeError({
      message: "ok",
      code: 500,
      details: { nested: true },
    });
    expect(result.code).toBeUndefined();
    expect(result.details).toBeUndefined();
  });
});
