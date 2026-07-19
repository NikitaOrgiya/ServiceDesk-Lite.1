import { CheckCircle2, CircleDot, Clock, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatCard } from "@/features/tickets/components/stat-card";
import { getEmployeeDashboardCounts } from "@/features/tickets/queries/get-employee-dashboard";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";

// Rendered fresh per request — this reads the caller's own RLS-scoped
// ticket counts, so it must never be statically cached or shared across
// users via Next.js's data cache.
export const dynamic = "force-dynamic";

export default async function EmployeeDashboardPage() {
  const counts = await getEmployeeDashboardCounts();

  const stats = [
    { label: "Открытые", value: counts?.open ?? 0, icon: CircleDot },
    { label: "В работе", value: counts?.inProgress ?? 0, icon: Loader2 },
    { label: "Ожидающие", value: counts?.waiting ?? 0, icon: Clock },
    { label: "Завершённые", value: counts?.done ?? 0, icon: CheckCircle2 },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Обзор заявок</h2>
        <p className="text-sm text-muted-foreground">
          Сводка по вашим обращениям в техподдержку.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {counts === null ? (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить сводку</AlertTitle>
          <AlertDescription>{getTicketErrorMessage("dashboard")}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
