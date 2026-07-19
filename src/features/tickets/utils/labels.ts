import type { TicketCategory, TicketPriority } from "@/features/tickets/schemas/create-ticket";
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from "@/features/tickets/schemas/create-ticket";
import type { TicketStatus } from "@/features/tickets/types/ticket";
import { TICKET_STATUSES } from "@/features/tickets/types/ticket";

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

const STATUS_LABELS: Record<TicketStatus, string> = {
  new: "Новая",
  accepted: "Принята",
  in_progress: "В работе",
  waiting: "Ожидание",
  resolved: "Решена",
  closed: "Закрыта",
  cancelled: "Отменена",
};

export function formatCategory(category: TicketCategory): string {
  return CATEGORY_LABELS[category];
}

export function formatPriority(priority: TicketPriority): string {
  return PRIORITY_LABELS[priority];
}

export function formatStatus(status: TicketStatus): string {
  return STATUS_LABELS[status];
}

export const categoryOptions = TICKET_CATEGORIES.map((value) => ({
  value,
  label: formatCategory(value),
}));

export const priorityOptions = TICKET_PRIORITIES.map((value) => ({
  value,
  label: formatPriority(value),
}));

export const statusOptions = TICKET_STATUSES.map((value) => ({
  value,
  label: formatStatus(value),
}));
