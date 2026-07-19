import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";

export default function NotFound() {
  return (
    <PageContainer className="flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">Страница не найдена</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Проверьте адрес страницы или вернитесь на главную.
      </p>
      <Button asChild>
        <Link href="/">На главную</Link>
      </Button>
    </PageContainer>
  );
}
