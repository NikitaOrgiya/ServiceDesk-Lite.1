/**
 * Fixed, generic Russian messages shown to the user for every ticket
 * mutation failure — deliberately independent of the underlying Supabase
 * error's message/code/details/hint, which are logged (sanitized) but never
 * surfaced. This is what guarantees a user can never see a SQL error,
 * policy name, or another user's identifier through a failed mutation.
 */
export const TICKET_ERROR_MESSAGES = {
  create: "Не удалось создать заявку. Попробуйте ещё раз позже.",
  comment: "Не удалось отправить комментарий. Попробуйте ещё раз позже.",
  cancel: "Не удалось отменить заявку. Попробуйте ещё раз позже.",
  dashboard: "Не удалось загрузить сводку по заявкам.",
  list: "Не удалось загрузить список заявок.",
  detail: "Не удалось загрузить заявку.",
  history: "Не удалось загрузить историю заявки.",
} as const;

export type TicketErrorContext = keyof typeof TICKET_ERROR_MESSAGES;

export function getTicketErrorMessage(context: TicketErrorContext): string {
  return TICKET_ERROR_MESSAGES[context];
}
