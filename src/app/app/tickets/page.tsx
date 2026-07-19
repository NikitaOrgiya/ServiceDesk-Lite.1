import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { parseTicketListQuery } from "@/features/tickets/schemas/list-query";
import { getEmployeeTickets } from "@/features/tickets/queries/get-employee-tickets";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";
import { TicketFilters } from "@/features/tickets/components/ticket-filters";
import { TicketTable } from "@/features/tickets/components/ticket-table";
import { TicketPagination } from "@/features/tickets/components/ticket-pagination";

// Reads the caller's own RLS-scoped tickets and depends on the request's
// URL search params — must never be statically cached.
export const dynamic = "force-dynamic";

type MyTicketsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MyTicketsPage({ searchParams }: MyTicketsPageProps) {
  const rawParams = await searchParams;
  const query = parseTicketListQuery(rawParams);
  const result = await getEmployeeTickets(query);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Мои заявки</h2>
          <p className="text-sm text-muted-foreground">
            Список ваших обращений в техническую поддержку.
          </p>
        </div>
        <Button asChild>
          <Link href="/app/tickets/new">
            <Plus />
            Новая заявка
          </Link>
        </Button>
      </div>

      <TicketFilters query={query} />

      {result === null ? (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить заявки</AlertTitle>
          <AlertDescription>{getTicketErrorMessage("list")}</AlertDescription>
        </Alert>
      ) : (
        <>
          <TicketTable items={result.items} />
          <TicketPagination query={query} total={result.total} />
        </>
      )}
    </div>
  );
}
