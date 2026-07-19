"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { navItemsBySection, type NavSection } from "@/config/navigation";

type AppSidebarProps = {
  section: NavSection;
  label: string;
  onNavigate?: () => void;
};

export function AppSidebar({ section, label, onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const items = navItemsBySection[section];

  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
