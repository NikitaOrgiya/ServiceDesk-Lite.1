"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ADMIN_TICKET_UNASSIGNED } from "@/features/tickets/schemas/admin-list-query";
import { updateAdminTicketAssigneeAction } from "@/features/tickets/actions/update-admin-ticket-assignee";
import { resolveAdminAssigneeSelectState } from "@/features/tickets/utils/admin-assignee-select";
import type { AdminAssigneeOption } from "@/features/tickets/queries/get-admin-assignee-options";

const fieldClassName =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm";

type AdminTicketAssigneeFormProps = {
  ticketId: string;
  currentAssigneeId: string | null;
  currentAssigneeName: string | null;
  /**
   * Active profiles only (see getAdminAssigneeOptions). `null` means the
   * options query itself failed — a distinct, safe-degraded state from
   * `[]` (query succeeded, there are simply no active profiles): in both
   * cases the ticket detail page still renders, this form just disables
   * reassignment rather than pretending there are no employees or that
   * the ticket doesn't exist.
   */
  assigneeOptions: AdminAssigneeOption[] | null;
};

/**
 * `currentAssigneeId` only seeds the <select>'s initial value — the RPC
 * (public.admin_set_ticket_assignee) is the sole authority on whether a
 * given id is actually assignable (an inactive/nonexistent profile id is
 * rejected there with SQLSTATE 23514, mapped to a safe message).
 *
 * When the ticket's current assignee is not among the active options —
 * because that profile has since gone inactive, or the options query
 * failed — this never silently substitutes the first active option: it
 * keeps the real current assignee's *name* (never their id, beyond the
 * hidden option value used only to preserve the current selection) visible
 * as a distinct, disabled placeholder choice, alongside whatever active
 * options are actually available, so the admin can still reassign or
 * unassign instead of unknowingly reassigning to someone else.
 */
export function AdminTicketAssigneeForm({
  ticketId,
  currentAssigneeId,
  currentAssigneeName,
  assigneeOptions,
}: AdminTicketAssigneeFormProps) {
  const initialValue = currentAssigneeId ?? ADMIN_TICKET_UNASSIGNED;
  const [assignee, setAssignee] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { options, optionsUnavailable, currentIsKnownActive } = resolveAdminAssigneeSelectState(
    currentAssigneeId,
    assigneeOptions
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("ticketId", ticketId);
    formData.set("assignee", assignee);

    startTransition(async () => {
      const result = await updateAdminTicketAssigneeAction(formData);
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
        <CardTitle className="text-base">Исполнитель</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="admin-ticket-assignee-select" className="text-sm font-medium">
                Новый исполнитель
              </label>
              <select
                id="admin-ticket-assignee-select"
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                disabled={isPending || optionsUnavailable}
                className={fieldClassName}
              >
                <option value={ADMIN_TICKET_UNASSIGNED}>Не назначен</option>
                {!currentIsKnownActive && currentAssigneeId ? (
                  <option value={currentAssigneeId} disabled>
                    {currentAssigneeName ?? "—"} (недоступен)
                  </option>
                ) : null}
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.fullName}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={isPending || optionsUnavailable || assignee === initialValue}
            >
              {isPending ? "Сохранение…" : "Изменить исполнителя"}
            </Button>
          </div>

          {optionsUnavailable ? (
            <Alert variant="destructive">
              <AlertTitle>Список сотрудников недоступен</AlertTitle>
              <AlertDescription>
                Не удалось загрузить список исполнителей. Попробуйте обновить страницу.
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Не удалось изменить исполнителя</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {success ? (
            <Alert>
              <AlertTitle>Исполнитель обновлён</AlertTitle>
            </Alert>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
