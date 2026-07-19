import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/features/tickets/components/status-badge";
import { PriorityBadge } from "@/features/tickets/components/priority-badge";
import { formatCategory } from "@/features/tickets/utils/labels";
import { formatDate } from "@/features/tickets/utils/format-date";
import type { TicketListItem } from "@/features/tickets/types/ticket";

type TicketTableProps = {
  items: TicketListItem[];
};

export function TicketTable({ items }: TicketTableProps) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Заявок не найдено. Попробуйте изменить условия поиска или фильтры.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Table view — sm and up */}
      <div className="hidden overflow-x-auto rounded-lg border sm:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Список ваших заявок в техподдержку</caption>
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Номер
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Тема
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Категория
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Приоритет
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Статус
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Создана
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Исполнитель
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  <Link
                    href={`/app/tickets/${ticket.id}`}
                    className="underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {ticket.publicNumber}
                  </Link>
                </td>
                <td className="max-w-xs truncate px-4 py-3">{ticket.title}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatCategory(ticket.category)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <PriorityBadge priority={ticket.priority} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {formatDate(ticket.createdAt)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {ticket.assigneeName ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Card view — below sm */}
      <div className="flex flex-col gap-3 sm:hidden">
        {items.map((ticket) => (
          <Link key={ticket.id} href={`/app/tickets/${ticket.id}`} className="block">
            <Card className="transition-colors hover:bg-muted/30">
              <CardContent className="flex flex-col gap-2 py-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{ticket.publicNumber}</span>
                  <StatusBadge status={ticket.status} />
                </div>
                <p className="line-clamp-2 text-sm">{ticket.title}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatCategory(ticket.category)}</span>
                  <span aria-hidden>·</span>
                  <PriorityBadge priority={ticket.priority} />
                  <span aria-hidden>·</span>
                  <span>{formatDate(ticket.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
