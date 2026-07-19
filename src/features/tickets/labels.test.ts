import { describe, expect, it } from "vitest";

import {
  categoryOptions,
  formatCategory,
  formatPriority,
  priorityOptions,
} from "@/features/tickets/labels";

describe("formatCategory", () => {
  it("formats every category into Russian", () => {
    expect(formatCategory("hardware")).toBe("Оборудование");
    expect(formatCategory("software")).toBe("Программное обеспечение");
    expect(formatCategory("network")).toBe("Сеть");
    expect(formatCategory("access")).toBe("Доступы");
    expect(formatCategory("workplace")).toBe("Рабочее место");
    expect(formatCategory("other")).toBe("Другое");
  });

  it("exposes an option for every category", () => {
    expect(categoryOptions).toHaveLength(6);
  });
});

describe("formatPriority", () => {
  it("formats every priority into Russian", () => {
    expect(formatPriority("low")).toBe("Низкий");
    expect(formatPriority("normal")).toBe("Обычный");
    expect(formatPriority("high")).toBe("Высокий");
    expect(formatPriority("critical")).toBe("Критический");
  });

  it("exposes an option for every priority", () => {
    expect(priorityOptions).toHaveLength(4);
  });
});
