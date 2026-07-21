import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { ticketCategoryEnum, ticketPriorityEnum, ticketStatusEnum } from "@/db/schema/enums";
import { profiles } from "@/db/schema/profiles";

/**
 * Internal counter used only by generate_ticket_number() to mint atomic
 * ticket numbers. No anonymous/authenticated Data API access exists to this
 * table (see the RLS/GRANT migration).
 */
export const ticketNumberCounters = pgTable(
  "ticket_number_counters",
  {
    year: integer("year").primaryKey(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (table) => [
    check("ticket_number_counters_year_reasonable", sql`${table.year} BETWEEN 2000 AND 2999`),
    check("ticket_number_counters_last_value_non_negative", sql`${table.lastValue} >= 0`),
  ]
);

/**
 * Client-writable only through create_ticket() and the admin_set_ticket_
 * (status/priority/assignee/due_at) / cancel_own_ticket RPCs — direct
 * INSERT/UPDATE is blocked by RLS and revoked GRANTs.
 */
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicNumber: text("public_number").notNull().unique(),
    authorId: text("author_id")
      .notNull()
      .references(() => profiles.id),
    assigneeId: text("assignee_id").references(() => profiles.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: ticketCategoryEnum("category").notNull(),
    priority: ticketPriorityEnum("priority").notNull().default("normal"),
    status: ticketStatusEnum("status").notNull().default("new"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    updatedBy: text("updated_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "tickets_title_length",
      sql`char_length(trim(${table.title})) BETWEEN 5 AND 160`
    ),
    check(
      "tickets_description_length",
      sql`char_length(trim(${table.description})) BETWEEN 10 AND 5000`
    ),
    // SD-YYYY-NNNN for the first 9999 tickets of a year, widening to a
    // longer numeric tail after that instead of truncating or erroring —
    // see generate_ticket_number() in the SQL migrations.
    check(
      "tickets_public_number_format",
      sql`${table.publicNumber} ~ '^SD-[0-9]{4}-[0-9]{4,}$'`
    ),
    index("tickets_author_id_created_at_idx").on(table.authorId, table.createdAt.desc()),
    index("tickets_assignee_id_status_idx").on(table.assigneeId, table.status),
    index("tickets_status_created_at_idx").on(table.status, table.createdAt.desc()),
    index("tickets_priority_created_at_idx").on(table.priority, table.createdAt.desc()),
  ]
);
