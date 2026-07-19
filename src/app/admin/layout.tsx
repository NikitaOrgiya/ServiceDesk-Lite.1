import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { requireAdmin } from "@/features/auth/server/require-admin";

const NAV_LABEL = "Навигация администрирования";

// Same reasoning as src/app/app/layout.tsx: the proxy's redirect is only a
// UX shortcut. requireAdmin() re-verifies identity and role from
// public.profiles on every request — an employee (or a hidden menu item)
// is never sufficient to reach this section.
export default async function AdminSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await requireAdmin();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        section="admin"
        navLabel={NAV_LABEL}
        sectionTitle="Администрирование"
        profile={{
          fullName: profile.fullName,
          role: profile.role,
          department: profile.department,
        }}
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
