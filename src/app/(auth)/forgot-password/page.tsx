import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { siteConfig } from "@/config/site";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Link href="/" className="text-sm font-semibold text-muted-foreground">
            {siteConfig.name}
          </Link>
          <CardTitle className="text-2xl">Восстановление пароля</CardTitle>
          <CardDescription>
            Укажите email — если учётная запись существует, на неё придёт
            ссылка для сброса пароля.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
