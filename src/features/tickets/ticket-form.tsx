"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { createTicketSchema, type CreateTicketInput } from "@/features/tickets/schema";
import { categoryOptions, priorityOptions } from "@/features/tickets/labels";

const fieldClassName = cn(
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none",
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
);

export function NewTicketForm() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: "",
      description: "",
    },
  });

  function onSubmit() {
    // TODO(stage-2): call the `create_ticket` RPC once the Supabase schema
    // and RLS policies exist. The form only validates locally for now.
    setSubmitted(true);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        noValidate
      >
        {submitted ? (
          <Alert>
            <AlertTitle>Отправка пока недоступна</AlertTitle>
            <AlertDescription>
              Форма прошла проверку, но сохранение заявок появится на
              следующем этапе разработки.
            </AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Тема</FormLabel>
              <FormControl>
                <Input placeholder="Коротко опишите проблему" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Описание</FormLabel>
              <FormControl>
                <textarea
                  rows={5}
                  placeholder="Подробно опишите проблему: когда она возникла и что уже пробовали"
                  className={cn(fieldClassName, "h-auto resize-y py-2")}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Категория</FormLabel>
                <FormControl>
                  <select
                    className={fieldClassName}
                    name={field.name}
                    ref={field.ref}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  >
                    <option value="" disabled>
                      Выберите категорию
                    </option>
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Приоритет</FormLabel>
                <FormControl>
                  <select
                    className={fieldClassName}
                    name={field.name}
                    ref={field.ref}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  >
                    <option value="" disabled>
                      Выберите приоритет
                    </option>
                    {priorityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="sm:w-fit">
          <Send />
          Создать заявку
        </Button>
      </form>
    </Form>
  );
}
