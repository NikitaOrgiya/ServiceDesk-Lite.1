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

export default function LoginPage() {
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
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
