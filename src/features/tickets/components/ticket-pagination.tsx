import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TicketListQuery } from "@/features/tickets/schemas/list-query";

type TicketPaginationProps = {
  query: TicketListQuery;
  total: number;
};

function buildHref(query: TicketListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "all") params.set("status", query.status);
  if (query.sort !== "newest") params.set("sort", query.sort);
  if (query.pageSize !== 10) params.set("pageSize", String(query.pageSize));
  params.set("page", String(page));
  return `/app/tickets?${params.toString()}`;
}

export function TicketPagination({ query, total }: TicketPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
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
            <Link href={buildHref(query, currentPage - 1)} rel="prev">
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
            <Link href={buildHref(query, currentPage + 1)} rel="next">
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
