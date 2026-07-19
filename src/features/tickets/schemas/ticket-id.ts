import { z } from "zod";

/** Validates a `[id]` route param as a UUID before it ever reaches a query. */
export const ticketIdSchema = z.uuid();
