import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/features/tickets/components/status-badge";
import { PriorityBadge } from "@/features/tickets/components/priority-badge";
import { formatCategory } from "@/features/tickets/utils/labels";
import { formatDateTime } from "@/features/tickets/utils/format-date";
import type { TicketDetail } from "@/features/tickets/types/ticket";

type TicketDetailsProps = {
  ticket: TicketDetail;
};

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export function TicketDetails({ ticket }: TicketDetailsProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{ticket.publicNumber}</p>
          <CardTitle className="text-xl">{ticket.title}</CardTitle>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <h3 className="mb-1 text-sm font-medium text-muted-foreground">Описание</h3>
          <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Категория" value={formatCategory(ticket.category)} />
          <Field label="Автор" value={ticket.authorName} />
          <Field label="Исполнитель" value={ticket.assigneeName ?? "Не назначен"} />
          <Field label="Создана" value={formatDateTime(ticket.createdAt)} />
          <Field label="Обновлена" value={formatDateTime(ticket.updatedAt)} />
          <Field
            label="Срок выполнения"
            value={ticket.dueAt ? formatDateTime(ticket.dueAt) : "Не установлен"}
          />
          {ticket.resolvedAt ? (
            <Field label="Решена" value={formatDateTime(ticket.resolvedAt)} />
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}
