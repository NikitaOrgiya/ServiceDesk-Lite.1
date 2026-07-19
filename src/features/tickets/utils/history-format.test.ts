import { describe, expect, it } from "vitest";

import { formatHistoryActor, formatHistoryEvent } from "@/features/tickets/utils/history-format";
import type { TicketHistoryItem } from "@/features/tickets/types/ticket";

function event(overrides: Partial<TicketHistoryItem>): TicketHistoryItem {
  return {
    id: "1",
    eventType: "ticket_created",
    fieldName: null,
    oldValue: null,
    newValue: null,
    createdAt: "2026-07-19T10:00:00Z",
    actorName: "Иван Иванов",
    ...overrides,
  };
}

describe("formatHistoryEvent", () => {
  it("formats ticket_created with no detail", () => {
    expect(formatHistoryEvent(event({ eventType: "ticket_created" }))).toEqual({
      title: "Заявка создана",
      detail: null,
    });
  });

  it("formats ticket_cancelled and ticket_closed", () => {
    expect(formatHistoryEvent(event({ eventType: "ticket_cancelled" })).title).toBe("Заявка отменена");
    expect(formatHistoryEvent(event({ eventType: "ticket_closed" })).title).toBe("Заявка закрыта");
  });

  it("formats status_changed with Russian old/new labels, never the raw enum", () => {
    const result = formatHistoryEvent(
      event({ eventType: "status_changed", fieldName: "status", oldValue: "new", newValue: "accepted" })
    );
    expect(result.title).toBe("Статус изменён");
    expect(result.detail).toBe("Новая → Принята");
  });

  it("formats priority_changed with Russian labels", () => {
    const result = formatHistoryEvent(
      event({ eventType: "priority_changed", fieldName: "priority", oldValue: "low", newValue: "high" })
    );
    expect(result.detail).toBe("Низкий → Высокий");
  });

  it("formats assignee_changed using whatever display value it was given, never a raw UUID", () => {
    const result = formatHistoryEvent(
      event({
        eventType: "assignee_changed",
        fieldName: "assignee_id",
        oldValue: null,
        newValue: "Мария Петрова",
      })
    );
    expect(result.title).toBe("Исполнитель изменён");
    expect(result.detail).toBe("не назначен → Мария Петрова");
    expect(result.detail).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });

  it("formats due_at_changed as Russian dates", () => {
    const result = formatHistoryEvent(
      event({
        eventType: "due_at_changed",
        fieldName: "due_at",
        oldValue: null,
        newValue: "2026-07-20T12:00:00Z",
      })
    );
    expect(result.detail).toContain("не установлен →");
  });

  it("falls back to a generic label for an unrecognized event type", () => {
    const result = formatHistoryEvent(event({ eventType: "something_new" as never }));
    expect(result.title).toBe("Системное действие");
  });
});

describe("formatHistoryActor", () => {
  it("shows the resolved name when present", () => {
    expect(formatHistoryActor("Иван Иванов")).toBe("Иван Иванов");
  });

  it("falls back to 'Системное действие' when there is no actor", () => {
    expect(formatHistoryActor(null)).toBe("Системное действие");
  });
});
