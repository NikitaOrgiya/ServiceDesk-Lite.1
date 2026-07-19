import { describe, expect, it } from "vitest";

import { decideRoleAccess, decideUserAccess } from "@/features/auth/access-decision";

describe("decideUserAccess", () => {
  it("sends an anonymous visitor to login", () => {
    expect(decideUserAccess(false, null)).toEqual({ type: "redirect_to_login" });
  });

  it("sends a session with no profile row to unauthorized", () => {
    expect(decideUserAccess(true, null)).toEqual({ type: "redirect_to_unauthorized" });
  });

  it("sends an inactive profile to unauthorized", () => {
    expect(decideUserAccess(true, { isActive: false })).toEqual({ type: "redirect_to_unauthorized" });
  });

  it("allows an active profile", () => {
    expect(decideUserAccess(true, { isActive: true })).toEqual({ type: "allow" });
  });
});

describe("decideRoleAccess", () => {
  it("allows a matching role", () => {
    expect(decideRoleAccess("employee", "employee")).toBe("allow");
    expect(decideRoleAccess("admin", "admin")).toBe("allow");
  });

  it("denies a mismatched role in either direction", () => {
    expect(decideRoleAccess("admin", "employee")).toBe("deny");
    expect(decideRoleAccess("employee", "admin")).toBe("deny");
  });
});
