import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";
import { siteConfig } from "@/config/site";
import { getCurrentProfile } from "@/features/auth/server/get-current-profile";
import { redirectByRole } from "@/features/auth/server/redirect-by-role";
import { sanitizeNextPath } from "@/features/auth/redirect";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  const sanitizedNext = sanitizeNextPath(next) ?? undefined;

  // An already-authenticated, active user opening /login goes straight to
  // their section — re-checked here on the server, not inferred from any
  // client-side state. An inactive profile falls through to the form
  // instead (requireUser() already blocks it from every protected route).
  const profile = await getCurrentProfile();
  if (profile && profile.isActive) {
    redirectByRole(profile.role, sanitizedNext);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Link href="/" className="text-sm font-semibold text-muted-foreground">
            {siteConfig.name}
          </Link>
          <CardTitle className="text-2xl">Вход в систему</CardTitle>
          <CardDescription>
            Используйте корпоративную учётную запись, чтобы попасть в кабинет
            сотрудника.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={sanitizedNext} />
        </CardContent>
      </Card>
    </div>
  );
}
