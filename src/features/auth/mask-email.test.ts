import { describe, expect, it } from "vitest";

import { maskEmail } from "@/features/auth/mask-email";

describe("maskEmail", () => {
  it("masks the local part while keeping the domain readable", () => {
    expect(maskEmail("john@example.com")).toBe("j***n@example.com");
  });

  it("fully masks a short local part", () => {
    expect(maskEmail("jo@example.com")).toBe("**@example.com");
    expect(maskEmail("j@example.com")).toBe("*@example.com");
  });

  it("never returns the original email unmasked", () => {
    const result = maskEmail("someone.private@company.example");
    expect(result).not.toBe("someone.private@company.example");
    expect(result).not.toContain("someone.private");
  });

  it("falls back to a generic mask for a malformed email", () => {
    expect(maskEmail("not-an-email")).toBe("***");
  });
});
