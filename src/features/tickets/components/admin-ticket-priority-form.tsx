"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { priorityOptions } from "@/features/tickets/utils/labels";
import { updateAdminTicketPriorityAction } from "@/features/tickets/actions/update-admin-ticket-priority";
import type { TicketPriority } from "@/features/tickets/schemas/create-ticket";

const fieldClassName =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm";

type AdminTicketPriorityFormProps = {
  ticketId: string;
  currentPriority: TicketPriority;
};

/**
 * Same shape and the same `key={currentPriority}`-remount contract as
 * AdminTicketStatusForm (see that component's doc comment) — `currentPriority`
 * only seeds the initial selection and disables the submit button on a
 * no-op selection; the RPC (public.admin_set_ticket_priority) is the only
 * authority on whether the write actually happens.
 */
export function AdminTicketPriorityForm({ ticketId, currentPriority }: AdminTicketPriorityFormProps) {
  const [priority, setPriority] = useState<TicketPriority>(currentPriority);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("ticketId", ticketId);
    formData.set("priority", priority);

    startTransition(async () => {
      const result = await updateAdminTicketPriorityAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Приоритет</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="admin-ticket-priority-select" className="text-sm font-medium">
                Новый приоритет
              </label>
              <select
                id="admin-ticket-priority-select"
                value={priority}
                onChange={(event) => setPriority(event.target.value as TicketPriority)}
                disabled={isPending}
                className={fieldClassName}
              >
                {priorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" disabled={isPending || priority === currentPriority}>
              {isPending ? "Сохранение…" : "Изменить приоритет"}
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Не удалось изменить приоритет</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {success ? (
            <Alert>
              <AlertTitle>Приоритет обновлён</AlertTitle>
            </Alert>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
