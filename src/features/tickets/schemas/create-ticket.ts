import { z } from "zod";

export const TICKET_CATEGORIES = [
  "hardware",
  "software",
  "network",
  "access",
  "workplace",
  "other",
] as const;

export const TICKET_PRIORITIES = ["low", "normal", "high", "critical"] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/**
 * Client-submittable fields for a new ticket. Deliberately excludes any
 * server-assigned value (author, ticket number, status, assignee, timestamps)
 * — those come only from the server (`requireEmployee()` + the
 * `create_ticket` RPC), never from the browser.
 */
export const createTicketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Тема должна содержать не менее 5 символов")
    .max(160, "Тема должна содержать не более 160 символов"),
  description: z
    .string()
    .trim()
    .min(10, "Описание должно содержать не менее 10 символов")
    .max(5000, "Описание должно содержать не более 5000 символов"),
  category: z.enum(TICKET_CATEGORIES, {
    error: "Выберите категорию заявки",
  }),
  priority: z.enum(TICKET_PRIORITIES, {
    error: "Выберите приоритет заявки",
  }),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
