import { CheckCircle2, CircleDot, Clock, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatCard } from "@/features/tickets/stat-card";

// Demo values only — the dashboard has no real ticket data until stage 2
// connects it to the Supabase schema and RLS-protected queries.
const DEMO_STATS = [
  { label: "Открытые", value: 0, icon: CircleDot },
  { label: "В работе", value: 0, icon: Loader2 },
  { label: "Ожидающие", value: 0, icon: Clock },
  { label: "Завершённые", value: 0, icon: CheckCircle2 },
] as const;

export default function EmployeeDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Обзор заявок</h2>
        <p className="text-sm text-muted-foreground">
          Сводка по вашим обращениям в техподдержку.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {DEMO_STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <Alert>
        <AlertTitle>Демонстрационные данные</AlertTitle>
        <AlertDescription>
          Показатели пока нулевые — реальные заявки появятся после того, как
          на следующем этапе будет подключена база данных.
        </AlertDescription>
      </Alert>
    </div>
  );
}
