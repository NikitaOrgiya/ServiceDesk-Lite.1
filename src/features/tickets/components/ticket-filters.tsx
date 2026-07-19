import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { statusOptions } from "@/features/tickets/utils/labels";
import type { TicketListQuery } from "@/features/tickets/schemas/list-query";

const fieldClassName =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm";

type TicketFiltersProps = {
  query: TicketListQuery;
};

/**
 * Plain GET form — submitting it navigates to `/app/tickets?...` with the
 * new query string, so this needs no client-side JS at all. `page` is
 * intentionally not one of the fields, so changing a filter always lands
 * back on page 1 (a stale `page` from before the filter change would
 * otherwise ask the server for a page that may no longer exist).
 */
export function TicketFilters({ query }: TicketFiltersProps) {
  return (
    <form
      method="get"
      action="/app/tickets"
      className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap"
    >
      <div className="flex flex-1 flex-col gap-1.5 sm:min-w-48">
        <label htmlFor="ticket-search" className="text-sm font-medium">
          Поиск
        </label>
        <Input
          id="ticket-search"
          type="search"
          name="q"
          maxLength={120}
          defaultValue={query.q}
          placeholder="Номер или тема заявки"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ticket-status" className="text-sm font-medium">
          Статус
        </label>
        <select
          id="ticket-status"
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
        <label htmlFor="ticket-sort" className="text-sm font-medium">
          Сортировка
        </label>
        <select id="ticket-sort" name="sort" defaultValue={query.sort} className={fieldClassName}>
          <option value="newest">Сначала новые</option>
          <option value="oldest">Сначала старые</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ticket-page-size" className="text-sm font-medium">
          На странице
        </label>
        <select
          id="ticket-page-size"
          name="pageSize"
          defaultValue={String(query.pageSize)}
          className={fieldClassName}
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
        </select>
      </div>

      <Button type="submit">Применить</Button>
    </form>
  );
}
