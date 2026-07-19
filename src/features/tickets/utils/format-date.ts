const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Formats an ISO timestamp as `дд.мм.гггг, чч:мм` in the server's locale. */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** Formats an ISO timestamp as `дд.мм.гггг` (no time component). */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}
