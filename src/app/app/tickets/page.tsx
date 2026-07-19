import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyTicketsPage() {
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

      <Card>
        <CardContent className="flex flex-col gap-3 py-6">
          {/* Placeholder rows illustrating the future list layout. */}
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Список заявок пока не подключён к базе данных — реальные обращения
        появятся здесь на следующем этапе.
      </p>
    </div>
  );
}
