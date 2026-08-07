import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { statusOptions, priorityOptions } from "@/features/tickets/utils/labels";
import { ADMIN_TICKET_UNASSIGNED } from "@/features/tickets/schemas/admin-list-query";
import type { AdminTicketListQuery } from "@/features/tickets/schemas/admin-list-query";
import type { AdminAssigneeOption } from "@/features/tickets/queries/get-admin-assignee-options";

const fieldClassName =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm";

type AdminTicketFiltersProps = {
  query: AdminTicketListQuery;
  assigneeOptions: AdminAssigneeOption[];
};

/**
 * Plain GET form — submitting it navigates to `/admin/tickets?...` with
 * the new query string, no client-side JS required. `page` is
 * intentionally not a field here (same reasoning as TicketFilters, the
 * employee equivalent): a filter change always lands back on page 1
 * instead of asking the server for a page number that may no longer
 * exist under the new filters.
 *
 * Every `<select>` lists the profile's full_name as its visible label and
 * the technical id as its `value` — never the reverse, and never any
 * other profile field.
 */
export function AdminTicketFilters({ query, assigneeOptions }: AdminTicketFiltersProps) {
  return (
    <form
      method="get"
      action="/admin/tickets"
      className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap"
    >
      <div className="flex flex-1 flex-col gap-1.5 sm:min-w-48">
        <label htmlFor="admin-ticket-search" className="text-sm font-medium">
          Поиск
        </label>
        <Input
          id="admin-ticket-search"
          type="search"
          name="q"
          maxLength={120}
          defaultValue={query.q}
          placeholder="Номер или тема заявки"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-ticket-status" className="text-sm font-medium">
          Статус
        </label>
        <select
          id="admin-ticket-status"
          name="status"
          defaultValue={query.status}
          className={fieldClassName}
        >
          <option value="all">Все статусы</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-ticket-priority" className="text-sm font-medium">
          Приоритет
        </label>
        <select
          id="admin-ticket-priority"
          name="priority"
          defaultValue={query.priority}
          className={fieldClassName}
        >
          <option value="all">Все приоритеты</option>
          {priorityOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-ticket-assignee" className="text-sm font-medium">
          Исполнитель
        </label>
        <select
          id="admin-ticket-assignee"
          name="assignee"
          defaultValue={query.assignee}
          className={fieldClassName}
        >
          <option value="">Все исполнители</option>
          <option value={ADMIN_TICKET_UNASSIGNED}>Без исполнителя</option>
          {assigneeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.fullName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <Button type="submit">Применить</Button>
        <Button asChild variant="outline" type="button">
          <Link href="/admin/tickets">Сбросить</Link>
        </Button>
      </div>
    </form>
  );
}
