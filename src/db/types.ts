import type {
  profiles,
  ticketComments,
  ticketHistory,
  ticketNumberCounters,
  tickets,
} from "@/db/schema";

export type ProfileRow = typeof profiles.$inferSelect;
export type ProfileInsert = typeof profiles.$inferInsert;

export type TicketRow = typeof tickets.$inferSelect;
export type TicketInsert = typeof tickets.$inferInsert;

export type TicketCommentRow = typeof ticketComments.$inferSelect;
export type TicketCommentInsert = typeof ticketComments.$inferInsert;

export type TicketHistoryRow = typeof ticketHistory.$inferSelect;

export type TicketNumberCounterRow = typeof ticketNumberCounters.$inferSelect;
