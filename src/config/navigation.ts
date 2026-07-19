import {
  LayoutDashboard,
  ListChecks,
  PlusCircle,
  ShieldCheck,
  Ticket,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const employeeNavItems: NavItem[] = [
  { title: "Дашборд", href: "/app", icon: LayoutDashboard },
  { title: "Мои заявки", href: "/app/tickets", icon: Ticket },
  { title: "Новая заявка", href: "/app/tickets/new", icon: PlusCircle },
];

export const adminNavItems: NavItem[] = [
  { title: "Дашборд", href: "/admin", icon: ShieldCheck },
  { title: "Реестр заявок", href: "/admin/tickets", icon: ListChecks },
];

export type NavSection = "employee" | "admin";

/**
 * Looked up by Client Components instead of receiving `NavItem[]` as a
 * prop from a Server Component — icon components are function references
 * and cannot cross the server/client serialization boundary as props.
 */
export const navItemsBySection: Record<NavSection, NavItem[]> = {
  employee: employeeNavItems,
  admin: adminNavItems,
};
