import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { parseAdminTicketListQuery, hasActiveAdminTicketFilters } from "@/features/tickets/schemas/admin-list-query";
import { getAdminTickets } from "@/features/tickets/queries/get-admin-tickets";
import { getAdminAssigneeOptions } from "@/features/tickets/queries/get-admin-assignee-options";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";
import { AdminTicketFilters } from "@/features/tickets/components/admin-ticket-filters";
import { AdminTicketTable } from "@/features/tickets/components/admin-ticket-table";
import { AdminTicketPagination } from "@/features/tickets/components/admin-ticket-pagination";

// Reads every ticket visible to the caller under RLS and depends on the
// request's own URL search params (?page=, ?q=, ?status=, ?priority=,
// ?assignee=) — must never be statically cached. Admin-only access is
// already enforced above this page, at src/app/admin/layout.tsx's
// requireAdmin() call (re-verified server-side from public.profiles.role
// on every request, the same as every other /admin/* page) — this page
// performs no authorization of its own; both getAdminTickets() and
// getAdminAssigneeOptions() independently re-verify it themselves too.
export const dynamic = "force-dynamic";

type AdminTicketsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminTicketsPage({ searchParams }: AdminTicketsPageProps) {
  const rawParams = await searchParams;
  const query = parseAdminTicketListQuery(rawParams);

  const [result, assigneeOptions] = await Promise.all([getAdminTickets(query), getAdminAssigneeOptions()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Реестр заявок</h2>
        <p className="text-sm text-muted-foreground">
          Единый список заявок всех сотрудников.
        </p>
      </div>

      {/* The assignee-options lookup is secondary to the registry itself —
          if it fails, the filter bar still renders with an empty assignee
          list (only "Все исполнители"/"Без исполнителя") rather than
          blocking the whole page. */}
      <AdminTicketFilters query={query} assigneeOptions={assigneeOptions ?? []} />

      {result === null ? (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить реестр</AlertTitle>
          <AlertDescription>{getTicketErrorMessage("adminList")}</AlertDescription>
        </Alert>
      ) : (
        <>
          <AdminTicketTable items={result.items} hasActiveFilters={hasActiveAdminTicketFilters(query)} />
          <AdminTicketPagination query={query} total={result.total} />
        </>
      )}
    </div>
  );
}
