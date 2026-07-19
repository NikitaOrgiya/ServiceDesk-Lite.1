import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { siteConfig } from "@/config/site";
import { getCurrentUser } from "@/features/auth/server/get-current-user";

// This page does not implement its own reset-token scheme — it relies on
// the recovery session /auth/callback already established by exchanging
// Supabase's emailed code. No session at all means the link was never
// followed (or already used/expired), so there is nothing to let the user
// do here except request a new one.
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/forgot-password");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Link href="/" className="text-sm font-semibold text-muted-foreground">
            {siteConfig.name}
          </Link>
          <CardTitle className="text-2xl">Новый пароль</CardTitle>
          <CardDescription>Придумайте новый пароль для входа.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
