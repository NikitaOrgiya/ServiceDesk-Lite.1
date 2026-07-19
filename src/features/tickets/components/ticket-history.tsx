import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/features/tickets/utils/format-date";
import { formatHistoryActor, formatHistoryEvent } from "@/features/tickets/utils/history-format";
import type { TicketHistoryItem } from "@/features/tickets/types/ticket";

type TicketHistoryProps = {
  history: TicketHistoryItem[];
};

/**
 * Renders history rows in the one chronological order the query already
 * returns (oldest first) — always via plain JSX text interpolation, never
 * `dangerouslySetInnerHTML`, so an event's stored text can never execute
 * as HTML/script.
 */
export function TicketHistory({ history }: TicketHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">История</CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">История пуста.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {history.map((event, index) => {
              const formatted = formatHistoryEvent(event);
              return (
                <li key={event.id}>
                  {index > 0 ? <Separator className="mb-4" /> : null}
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{formatted.title}</span>
                    <time dateTime={event.createdAt} className="text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </time>
                  </div>
                  {formatted.detail ? (
                    <p className="mt-1 text-sm text-muted-foreground">{formatted.detail}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatHistoryActor(event.actorName)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
