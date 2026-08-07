import { CheckCircle2, ListTodo, Loader2, UserX } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatCard } from "@/features/tickets/components/stat-card";
import { getAdminDashboardCounts } from "@/features/tickets/queries/get-admin-dashboard";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";

// Reads every ticket's status/assignment visible to the caller under RLS —
// must never be statically cached or shared across admins.
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const counts = await getAdminDashboardCounts();

  const stats = [
    { label: "Всего заявок", value: counts?.total ?? 0, icon: ListTodo },
    { label: "Без исполнителя", value: counts?.unassigned ?? 0, icon: UserX },
    { label: "В работе", value: counts?.inProgress ?? 0, icon: Loader2 },
    { label: "Завершённые", value: counts?.done ?? 0, icon: CheckCircle2 },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Обзор службы поддержки</h2>
        <p className="text-sm text-muted-foreground">
          Общая сводка по всем заявкам сотрудников.
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
