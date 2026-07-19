import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";

const NAV_LABEL = "Навигация администрирования";

// TODO(stage-2): enforce the admin role check here (or in middleware) once
// Supabase auth and RLS are in place. Today this route is not protected.
export default function AdminSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        section="admin"
        navLabel={NAV_LABEL}
        sectionTitle="Администрирование"
      />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <AppSidebar section="admin" label={NAV_LABEL} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
