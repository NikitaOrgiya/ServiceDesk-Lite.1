import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { requireEmployee } from "@/features/auth/server/require-employee";

const NAV_LABEL = "Навигация кабинета сотрудника";

// The proxy (src/proxy.ts) only makes a cheap, JWT-only check and already
// redirected an anonymous visitor to /login before this ever renders — but
// this layout does NOT trust that. requireEmployee() re-verifies identity
// and re-loads the profile from public.profiles on every request to this
// section, and is what actually decides whether an admin (or an inactive
// profile) is allowed to see the employee section.
export default async function EmployeeSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await requireEmployee();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        section="employee"
        navLabel={NAV_LABEL}
        sectionTitle="Кабинет сотрудника"
        profile={{
          fullName: profile.fullName,
          role: profile.role,
          department: profile.department,
        }}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <AppSidebar section="employee" label={NAV_LABEL} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
