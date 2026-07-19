import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { siteConfig } from "@/config/site";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <PageContainer className="flex items-center justify-between py-4">
          <span className="text-sm font-semibold">{siteConfig.name}</span>
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Войти</Link>
          </Button>
        </PageContainer>
      </header>

      <main className="flex flex-1 items-center">
        <PageContainer className="grid gap-10 py-16 md:grid-cols-2 md:items-center">
          <div className="flex flex-col gap-6">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {siteConfig.name}
            </h1>
            <p className="max-w-prose text-lg text-muted-foreground">
              {siteConfig.description}
            </p>
            <div>
              <Button asChild size="lg">
                <Link href="/login">Перейти к входу</Link>
              </Button>
            </div>
          </div>

          <ul className="flex flex-col gap-4">
            {siteConfig.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </PageContainer>
      </main>

      <footer className="border-t">
        <PageContainer className="py-6 text-sm text-muted-foreground">
          {siteConfig.name} — внутренний инструмент компании.
        </PageContainer>
      </footer>
    </div>
  );
}
