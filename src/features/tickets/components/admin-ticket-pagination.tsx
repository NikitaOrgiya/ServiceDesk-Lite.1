import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ADMIN_TICKET_PAGE_SIZE } from "@/features/tickets/queries/get-admin-tickets";
import type { AdminTicketListQuery } from "@/features/tickets/schemas/admin-list-query";

type AdminTicketPaginationProps = {
  query: AdminTicketListQuery;
  total: number;
};

function buildHref(page: number): string {
  const params = new URLSearchParams();
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
            <Link href={buildHref(currentPage - 1)} rel="prev">
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
            <Link href={buildHref(currentPage + 1)} rel="next">
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
