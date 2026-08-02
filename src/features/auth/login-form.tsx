"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { loginFormSchema, type LoginFormValues } from "@/features/auth/schema";

type LoginFormProps = {
  next?: string;
  hasError?: boolean;
};

const GENERIC_LOGIN_ERROR_MESSAGE = "Не удалось войти. Проверьте email и пароль.";

/**
 * Submits with a real, uninterrupted browser POST to `/auth/login` (see
 * src/app/auth/login/route.ts) — react-hook-form is used only to gate the
 * submit client-side (block it and show field errors when invalid), never
 * to transmit it. The password is never handed to `fetch`, `XMLHttpRequest`,
 * or a Server Action; it only ever travels in the body of the form's own
 * native POST.
 */
export function LoginForm({ next, hasError }: LoginFormProps) {
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = loginFormSchema.safeParse(form.getValues());
    if (!result.success) {
      event.preventDefault();
      void form.trigger();
    }
    // On success, this handler does nothing further and the native form
    // submission proceeds to the server unmodified.
  }

  return (
    <Form {...form}>
      <form
        method="post"
        action="/auth/login"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        {next ? <input type="hidden" name="next" value={next} /> : null}

        {hasError ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Не удалось войти</AlertTitle>
            <AlertDescription>{GENERIC_LOGIN_ERROR_MESSAGE}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Пароль</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground hover:underline"
          >
            Забыли пароль?
          </Link>
        </div>

        <Button type="submit" className="w-full">
          Войти
        </Button>
      </form>
    </Form>
  );
}
