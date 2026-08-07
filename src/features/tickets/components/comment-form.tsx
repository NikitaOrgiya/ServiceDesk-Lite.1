"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { addCommentSchema, type AddCommentInput } from "@/features/tickets/schemas/comment";

/**
 * Matches both addTicketCommentAction (employee) and
 * addAdminTicketCommentAction (admin) — same (ticketId, formData) => Promise<{error?}>
 * shape, so this presentational form stays route/auth-agnostic and never
 * imports either Server Action directly. The caller (TicketComments, via
 * its own `action` prop) decides which one actually runs.
 */
export type CommentSubmitAction = (
  ticketId: string,
  formData: FormData
) => Promise<{ error?: string }>;

type CommentFormProps = {
  ticketId: string;
  action: CommentSubmitAction;
};

export function CommentForm({ ticketId, action }: CommentFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<AddCommentInput>({
    resolver: zodResolver(addCommentSchema),
    defaultValues: { message: "" },
  });

  function onSubmit(values: AddCommentInput) {
    setFormError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("message", values.message);

      const result = await action(ticketId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      form.reset();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
        {formError ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Не удалось отправить комментарий</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="new-comment">Новый комментарий</FormLabel>
              <FormControl>
                <textarea
                  id="new-comment"
                  rows={3}
                  placeholder="Напишите комментарий к заявке"
                  disabled={isPending}
                  className={cn(
                    "border-input flex w-full resize-y rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none",
                    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
                  )}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" size="sm" className="sm:w-fit" disabled={isPending}>
          <Send />
          {isPending ? "Отправка…" : "Отправить"}
        </Button>
      </form>
    </Form>
  );
}
