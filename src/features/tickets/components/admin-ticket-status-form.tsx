"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { statusOptions } from "@/features/tickets/utils/labels";
import { updateAdminTicketStatusAction } from "@/features/tickets/actions/update-admin-ticket-status";
import type { TicketStatus } from "@/features/tickets/types/ticket";

const fieldClassName =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm";

type AdminTicketStatusFormProps = {
  ticketId: string;
  currentStatus: TicketStatus;
};

/**
 * `currentStatus` only seeds the <select>'s initial value and disables the
 * submit button when the selection hasn't changed — a UX convenience, not
 * a security input. Real transition legality is decided server-side inside
 * public.admin_set_ticket_status via is_valid_ticket_status_transition(),
 * which re-reads the ticket's actual current status itself; this component
 * only ever sends the target status the admin picked, nothing about "the
 * transition it thinks is happening".
 *
 * Rendered with `key={currentStatus}` by the caller so a successful
 * mutation (which revalidates this route and delivers a new `currentStatus`
 * prop) remounts this component and resets its local state to match —
 * without that, this client component's own useState would keep showing
 * the pre-mutation value after the server-rendered parent moves on.
 */
export function AdminTicketStatusForm({ ticketId, currentStatus }: AdminTicketStatusFormProps) {
  const [status, setStatus] = useState<TicketStatus>(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("ticketId", ticketId);
    formData.set("status", status);

    startTransition(async () => {
      const result = await updateAdminTicketStatusAction(formData);
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
        <CardTitle className="text-base">Статус</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="admin-ticket-status-select" className="text-sm font-medium">
                Новый статус
              </label>
              <select
                id="admin-ticket-status-select"
                value={status}
                onChange={(event) => setStatus(event.target.value as TicketStatus)}
                disabled={isPending}
                className={fieldClassName}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" disabled={isPending || status === currentStatus}>
              {isPending ? "Сохранение…" : "Изменить статус"}
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Не удалось изменить статус</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {success ? (
            <Alert>
              <AlertTitle>Статус обновлён</AlertTitle>
            </Alert>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
