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

/**
 * One row of the admin-wide ticket registry (src/app/admin/tickets) —
 * distinct from TicketListItem (an employee's own tickets: no requester
 * column needed, since it's always the caller) by also carrying the
 * requester's display name and no category, matching exactly what the
 * registry actually shows. Never carries author_id/assignee_id — only the
 * resolved display name via the same RLS-scoped profiles embed the query
 * layer already uses elsewhere.
 */
export type AdminTicketListItem = {
  id: string;
  publicNumber: string;
  title: string;
  priority: TicketPriority;
  status: TicketStatus;
  requesterName: string;
  assigneeName: string | null;
  createdAt: string;
  dueAt: string | null;
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

/**
 * Admin-only superset of TicketDetail carrying the assignee's technical
 * profile id — needed so the assignee mutation form can identify the
 * *current* assignee by id (two profiles can share the same full_name;
 * the id is the only reliable identity) without ever rendering that id as
 * visible text. Deliberately kept separate from TicketDetail — which stays
 * shared, unmodified, and minimal for the read-only employee detail page —
 * rather than adding assigneeId there.
 */
export type AdminTicketDetail = TicketDetail & {
  assigneeId: string | null;
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

/**
 * Admin dashboard counters — deliberately a different shape from
 * EmployeeDashboardCounts (total/unassigned instead of open/waiting):
 * the admin dashboard summarizes every ticket, so "how many have no
 * assignee yet" is a meaningful triage signal that has no equivalent on
 * an employee's own-tickets-only dashboard.
 */
export type AdminDashboardCounts = {
  total: number;
  unassigned: number;
  inProgress: number;
  done: number;
};
