import type { TicketCategory, TicketPriority } from "@/features/tickets/schemas/create-ticket";

export const TICKET_STATUSES = [
  "new",
  "accepted",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
  "cancelled",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type TicketListItem = {
  id: string;
  publicNumber: string;
  title: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  assigneeName: string | null;
};

export type TicketDetail = {
  id: string;
  publicNumber: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  dueAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  assigneeName: string | null;
};

export type TicketCommentItem = {
  id: string;
  message: string;
  createdAt: string;
  authorName: string;
  authorRole: "employee" | "admin";
};

export type TicketHistoryEventType =
  | "ticket_created"
  | "status_changed"
  | "ticket_cancelled"
  | "ticket_closed"
  | "priority_changed"
  | "assignee_changed"
  | "due_at_changed";

export type TicketHistoryItem = {
  id: string;
  eventType: TicketHistoryEventType;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  actorName: string | null;
};

export type EmployeeDashboardCounts = {
  open: number;
  inProgress: number;
  waiting: number;
  done: number;
};
