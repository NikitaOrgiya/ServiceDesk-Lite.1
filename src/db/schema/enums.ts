import { pgEnum } from "drizzle-orm/pg-core";

// Deliberately excludes a separate "assignee" role — an assignee is simply
// an active profile (employee or admin), see docs/database.md.
export const userRoleEnum = pgEnum("user_role", ["employee", "admin"]);

// Full transition table is enforced in SQL by
// is_valid_ticket_status_transition() — this enum only fixes the vocabulary.
export const ticketStatusEnum = pgEnum("ticket_status", [
  "new",
  "accepted",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
  "cancelled",
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "low",
  "normal",
  "high",
  "critical",
]);

export const ticketCategoryEnum = pgEnum("ticket_category", [
  "hardware",
  "software",
  "network",
  "access",
  "workplace",
  "other",
]);
