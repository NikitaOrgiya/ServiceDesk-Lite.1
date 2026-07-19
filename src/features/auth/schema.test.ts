import { describe, expect, it } from "vitest";

import { loginFormSchema, newPasswordSchema, passwordResetRequestSchema } from "@/features/auth/schema";

describe("loginFormSchema", () => {
  it("accepts a valid email/password pair", () => {
    expect(loginFormSchema.safeParse({ email: "user@example.com", password: "hunter2" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(loginFormSchema.safeParse({ email: "not-an-email", password: "hunter2" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginFormSchema.safeParse({ email: "user@example.com", password: "" }).success).toBe(false);
  });
});

describe("passwordResetRequestSchema", () => {
  it("accepts a valid email", () => {
    expect(passwordResetRequestSchema.safeParse({ email: "user@example.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(passwordResetRequestSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("accepts matching passwords of sufficient length", () => {
    const result = newPasswordSchema.safeParse({
      password: "correct-horse-battery",
      confirmPassword: "correct-horse-battery",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = newPasswordSchema.safeParse({ password: "short1", confirmPassword: "short1" });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = newPasswordSchema.safeParse({
      password: "correct-horse-battery",
      confirmPassword: "totally-different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });
});
