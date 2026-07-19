"use client";

import { useState } from "react";
import { LogOut, Menu, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { siteConfig } from "@/config/site";
import type { NavSection } from "@/config/navigation";
import { formatRole } from "@/features/auth/roles";
import type { ProfileViewModel } from "@/features/auth/profile-view-model";
import { logoutAction } from "@/features/auth/actions/logout";

type AppHeaderProps = {
  section: NavSection;
  navLabel: string;
  sectionTitle: string;
  profile: ProfileViewModel;
};

export function AppHeader({ section, navLabel, sectionTitle, profile }: AppHeaderProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Открыть меню навигации"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetHeader className="border-b">
              <SheetTitle>{siteConfig.name}</SheetTitle>
            </SheetHeader>
            <div className="p-3">
              <AppSidebar
                section={section}
                label={navLabel}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <span className="hidden shrink-0 text-sm font-semibold md:inline">
            {siteConfig.name}
          </span>
          <span className="hidden text-muted-foreground md:inline">/</span>
          <h1 className="truncate text-sm font-medium">{sectionTitle}</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-md border px-2 py-1.5 text-sm sm:flex">
            <UserRound className="size-4 text-muted-foreground" />
            <div className="flex flex-col leading-tight">
              <span className="font-medium">{profile.fullName}</span>
              <span className="text-xs text-muted-foreground">
                {formatRole(profile.role)}
                {profile.department ? ` · ${profile.department}` : ""}
              </span>
            </div>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
