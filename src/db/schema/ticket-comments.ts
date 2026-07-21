import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { profiles } from "@/db/schema/profiles";
import { tickets } from "@/db/schema/tickets";

/**
 * Editing/deleting is out of scope for the MVP — rows are inserted only via
 * add_ticket_comment().
 */
export const ticketComments = pgTable(
  "ticket_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => profiles.id),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "ticket_comments_message_length",
      sql`char_length(trim(${table.message})) BETWEEN 1 AND 3000`
    ),
    index("ticket_comments_ticket_id_created_at_idx").on(table.ticketId, table.createdAt),
  ]
);
