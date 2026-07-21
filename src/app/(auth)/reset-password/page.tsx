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

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string }>;
};

// Neon Auth's password-reset email links here with a `token` query param
// (Better Auth's email/password reset flow) — there is no established
// "recovery session" to check for, unlike the Supabase-era flow. No token
// at all means the link was never followed (or is malformed), so there is
// nothing to let the user do here except request a new one.
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;

  if (!token) {
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
          <ResetPasswordForm token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
