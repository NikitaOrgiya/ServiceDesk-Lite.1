import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { profiles } from "@/db/schema/profiles";
import { tickets } from "@/db/schema/tickets";

/**
 * Append-only audit trail populated exclusively by the
 * record_ticket_history() trigger. No direct client writes exist.
 */
export const ticketHistory = pgTable(
  "ticket_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => profiles.id),
    eventType: text("event_type").notNull(),
    fieldName: text("field_name"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ticket_history_ticket_id_created_at_idx").on(table.ticketId, table.createdAt)]
);
