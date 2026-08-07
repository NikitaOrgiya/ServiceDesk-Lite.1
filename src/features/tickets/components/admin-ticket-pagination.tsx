import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ADMIN_TICKET_PAGE_SIZE, type AdminTicketListQuery } from "@/features/tickets/schemas/admin-list-query";

type AdminTicketPaginationProps = {
  query: AdminTicketListQuery;
  total: number;
};

/**
 * Only ever writes back normalized, whitelisted query values (the same
 * `query` object the page already validated via
 * parseAdminTicketListQuery/adminTicketListQuerySchema) — never a raw,
 * unrecognized param from the incoming request. `page` is the only field
 * this function itself varies; q/status/priority/assignee are carried
 * through unchanged, so Next/Previous never lose the active filters.
 */
export function buildAdminTicketHref(query: AdminTicketListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "all") params.set("status", query.status);
  if (query.priority !== "all") params.set("priority", query.priority);
  if (query.assignee) params.set("assignee", query.assignee);
  params.set("page", String(page));
  return `/admin/tickets?${params.toString()}`;
}

export function AdminTicketPagination({ query, total }: AdminTicketPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_TICKET_PAGE_SIZE));
  const currentPage = Math.min(query.page, totalPages);

  if (totalPages <= 1) {
    return null;
  }

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav aria-label="Постраничная навигация" className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        Страница {currentPage} из {totalPages}
      </p>
      <div className="flex gap-2">
        {hasPrev ? (
          <Button asChild variant="outline" size="sm">
            <Link href={buildAdminTicketHref(query, currentPage - 1)} rel="prev">
              <ChevronLeft />
              Назад
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft />
            Назад
          </Button>
        )}

        {hasNext ? (
          <Button asChild variant="outline" size="sm">
            <Link href={buildAdminTicketHref(query, currentPage + 1)} rel="next">
              Вперёд
              <ChevronRight />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Вперёд
            <ChevronRight />
          </Button>
        )}
      </div>
    </nav>
  );
}
