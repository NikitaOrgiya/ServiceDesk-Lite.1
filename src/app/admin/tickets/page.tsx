import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const COLUMNS = [
  "Номер",
  "Тема",
  "Сотрудник",
  "Категория",
  "Приоритет",
  "Статус",
] as const;

export default function AdminTicketsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Реестр заявок</h2>
        <p className="text-sm text-muted-foreground">
          Единый список заявок всех сотрудников.
        </p>
      </div>

      <Card>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  {COLUMNS.map((column) => (
                    <th key={column} className="px-6 pb-3 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>
          <Separator />
          <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
            <p className="text-sm font-medium">Заявок пока нет</p>
            <p className="text-sm text-muted-foreground">
              Реестр подключится к базе данных на следующем этапе разработки.
            </p>
          </div>
        </CardContent>
      </Card>

      {/*
        TODO(stage-2): this page must only be reachable by an authenticated
        admin — add the server-side role check (middleware or a layout-level
        guard reading the Supabase session) once auth exists.
      */}
    </div>
  );
}
