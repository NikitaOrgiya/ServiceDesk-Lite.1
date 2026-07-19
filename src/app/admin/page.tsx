import { AlertTriangle, CheckCircle2, ListTodo, UserX } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatCard } from "@/features/tickets/components/stat-card";

// Demo values only — real aggregates arrive once the Supabase schema and
// admin-facing queries are built in a later stage.
const DEMO_STATS = [
  { label: "Всего заявок", value: 0, icon: ListTodo },
  { label: "Без исполнителя", value: 0, icon: UserX },
  { label: "Просрочено", value: 0, icon: AlertTriangle },
  { label: "Закрыто сегодня", value: 0, icon: CheckCircle2 },
] as const;

export default function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Обзор службы поддержки</h2>
        <p className="text-sm text-muted-foreground">
          Общая сводка по всем заявкам сотрудников.
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
          Показатели пока нулевые. Проверка ролей администратора и реальные
          запросы к базе данных появятся на следующем этапе.
        </AlertDescription>
      </Alert>
    </div>
  );
}
