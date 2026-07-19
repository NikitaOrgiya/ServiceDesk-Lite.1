import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";

export default function UnauthorizedPage() {
  return (
    <PageContainer className="flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Доступ запрещён</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        У вас нет прав для просмотра этого раздела. Если вы считаете, что это
        ошибка, обратитесь к администратору системы.
      </p>
      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link href="/">На главную</Link>
        </Button>
        <Button asChild>
          <Link href="/login">Войти под другой учётной записью</Link>
        </Button>
      </div>
    </PageContainer>
  );
}
