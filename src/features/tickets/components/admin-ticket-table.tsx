import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/features/tickets/components/status-badge";
import { PriorityBadge } from "@/features/tickets/components/priority-badge";
import { formatDate } from "@/features/tickets/utils/format-date";
import type { AdminTicketListItem } from "@/features/tickets/types/ticket";

type AdminTicketTableProps = {
  items: AdminTicketListItem[];
  hasActiveFilters: boolean;
};

/**
 * Read-only — each row's ticket number/title link to the admin-only detail
 * route (/admin/tickets/[id], src/app/admin/tickets/[id]/page.tsx), built
 * from `ticket.id` (the same technical route-key convention the employee
 * detail route already uses). Never links to /app/tickets/[id] — that route
 * is employee-only, gated to the ticket's own author, and must never be
 * reused from the admin registry.
 *
 * `hasActiveFilters` distinguishes "the registry is genuinely empty" from
 * "these filters just don't match anything" without an extra unbounded
 * query — the caller already knows whether q/status/priority/assignee are
 * active (see hasActiveAdminTicketFilters in schemas/admin-list-query.ts).
 */
export function getAdminTicketDetailHref(ticketId: string): string {
  return `/admin/tickets/${ticketId}`;
}

export function AdminTicketTable({ items, hasActiveFilters }: AdminTicketTableProps) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {hasActiveFilters ? "По заданным фильтрам заявки не найдены." : "Заявок пока нет."}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Table view — sm and up */}
      <div className="hidden overflow-x-auto rounded-lg border sm:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Реестр заявок всех сотрудников</caption>
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Номер
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Тема
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Приоритет
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Статус
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Сотрудник
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Исполнитель
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Создана
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Срок
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  <Link href={getAdminTicketDetailHref(ticket.id)} className="hover:underline">
                    {ticket.publicNumber}
                  </Link>
                </td>
                <td className="max-w-xs truncate px-4 py-3">
                  <Link href={getAdminTicketDetailHref(ticket.id)} className="hover:underline">
                    {ticket.title}
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <PriorityBadge priority={ticket.priority} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{ticket.requesterName}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {ticket.assigneeName ?? "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {formatDate(ticket.createdAt)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {ticket.dueAt ? formatDate(ticket.dueAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Card view — below sm */}
      <div className="flex flex-col gap-3 sm:hidden">
        {items.map((ticket) => (
          <Card key={ticket.id}>
            <CardContent className="flex flex-col gap-2 py-4">
              <div className="flex items-center justify-between gap-2">
                <Link href={getAdminTicketDetailHref(ticket.id)} className="font-medium hover:underline">
                  {ticket.publicNumber}
                </Link>
                <StatusBadge status={ticket.status} />
              </div>
              <Link href={getAdminTicketDetailHref(ticket.id)} className="line-clamp-2 text-sm hover:underline">
                {ticket.title}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{ticket.requesterName}</span>
                <span aria-hidden>·</span>
                <PriorityBadge priority={ticket.priority} />
                <span aria-hidden>·</span>
                <span>{formatDate(ticket.createdAt)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
