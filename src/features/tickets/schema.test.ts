import { describe, expect, it } from "vitest";

import { createTicketSchema } from "@/features/tickets/schema";

const validTicket = {
  title: "Не работает принтер",
  description: "Принтер на 3 этаже не печатает документы уже второй день.",
  category: "hardware",
  priority: "normal",
};

describe("createTicketSchema", () => {
  it("accepts a valid ticket", () => {
    const result = createTicketSchema.safeParse(validTicket);
    expect(result.success).toBe(true);
  });

  it("rejects a title shorter than 5 characters", () => {
    const result = createTicketSchema.safeParse({ ...validTicket, title: "Хм" });
    expect(result.success).toBe(false);
  });

  it("rejects a title longer than 160 characters", () => {
    const result = createTicketSchema.safeParse({
      ...validTicket,
      title: "а".repeat(161),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a description shorter than 10 characters", () => {
    const result = createTicketSchema.safeParse({
      ...validTicket,
      description: "коротко",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown category", () => {
    const result = createTicketSchema.safeParse({
      ...validTicket,
      category: "furniture",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown priority", () => {
    const result = createTicketSchema.safeParse({
      ...validTicket,
      priority: "urgent",
    });
    expect(result.success).toBe(false);
  });

  it("does not accept server-assigned fields as part of the schema shape", () => {
    expect(Object.keys(createTicketSchema.shape)).toEqual([
      "title",
      "description",
      "category",
      "priority",
    ]);
  });
});
