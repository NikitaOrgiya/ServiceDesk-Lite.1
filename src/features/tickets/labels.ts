import type { TicketCategory, TicketPriority } from "@/features/tickets/schema";
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from "@/features/tickets/schema";

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  hardware: "Оборудование",
  software: "Программное обеспечение",
  network: "Сеть",
  access: "Доступы",
  workplace: "Рабочее место",
  other: "Другое",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  critical: "Критический",
};

export function formatCategory(category: TicketCategory): string {
  return CATEGORY_LABELS[category];
}

export function formatPriority(priority: TicketPriority): string {
  return PRIORITY_LABELS[priority];
}

export const categoryOptions = TICKET_CATEGORIES.map((value) => ({
  value,
  label: formatCategory(value),
}));

export const priorityOptions = TICKET_PRIORITIES.map((value) => ({
  value,
  label: formatPriority(value),
}));
