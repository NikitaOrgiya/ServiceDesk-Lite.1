"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side boundary — never log tokens/cookies here. Only the
    // message and Next.js's own digest (safe, opaque) are recorded.
    console.error("app:unhandled_error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <PageContainer className="flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Что-то пошло не так</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Произошла непредвиденная ошибка. Попробуйте обновить страницу.
      </p>
      <Button onClick={() => reset()}>Попробовать снова</Button>
    </PageContainer>
  );
}
