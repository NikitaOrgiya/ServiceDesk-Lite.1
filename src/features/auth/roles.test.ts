import { describe, expect, it } from "vitest";

import { formatRole } from "@/features/auth/roles";

describe("formatRole", () => {
  it("formats every role into Russian", () => {
    expect(formatRole("employee")).toBe("Сотрудник");
    expect(formatRole("admin")).toBe("Администратор");
  });
});
