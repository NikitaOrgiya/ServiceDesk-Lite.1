"use client";

import { useEffect } from "react";

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app:global_error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="ru">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center font-sans">
        <h1 className="text-2xl font-semibold">Критическая ошибка приложения</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Приложение не смогло загрузиться. Попробуйте обновить страницу.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Попробовать снова
        </button>
      </body>
    </html>
  );
}
