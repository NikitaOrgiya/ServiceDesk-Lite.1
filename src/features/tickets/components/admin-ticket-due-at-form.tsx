"use client";

import { useState, useSyncExternalStore, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { isoToLocalInputValue, localInputValueToIso } from "@/features/tickets/utils/datetime-local";
import { updateAdminTicketDueAtAction } from "@/features/tickets/actions/update-admin-ticket-due-at";

const fieldClassName =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm";

type AdminTicketDueAtFormProps = {
  ticketId: string;
  currentDueAt: string | null;
};

const noopSubscribe = () => () => {};

/**
 * True once React has hydrated on the client, false during SSR and during
 * the initial hydration render — the sanctioned way (per React's own docs)
 * to read a value that legitimately differs between server and client
 * without a server/client render mismatch, and without calling setState
 * from inside an effect (see below for why that matters here).
 */
function useIsMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

/**
 * `currentDueAt` is an absolute ISO instant; the <input type="datetime-local">
 * needs a local-wall-clock string with no timezone of its own. That
 * conversion (isoToLocalInputValue) must happen in the *admin's* browser,
 * never during SSR — doing it on the server would resolve against the
 * server's timezone instead and could silently display a shifted time.
 *
 * `draft` only ever holds a value once the admin actually edits/clears the
 * field by hand; until then the displayed value is derived fresh on every
 * render from `isMounted`/`currentDueAt` (`""` before hydration completes,
 * the real local value after) — never written via a `useEffect` calling
 * `setState`, which would ordinarily be the natural way to do this but is
 * both unnecessary here (derivation is pure and synchronous) and flagged
 * by this project's lint rules as an anti-pattern to avoid. The same
 * conversion applies in reverse on submit: the browser-local value the
 * admin picked is converted back to an absolute ISO instant
 * (localInputValueToIso) before ever reaching the Server Action, which
 * then only accepts an already-absolute, offset-bearing instant (or the
 * empty "clear" sentinel) — see adminSetTicketDueAtSchema.
 */
export function AdminTicketDueAtForm({ ticketId, currentDueAt }: AdminTicketDueAtFormProps) {
  const isMounted = useIsMounted();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const derivedValue = isMounted && currentDueAt ? isoToLocalInputValue(currentDueAt) : "";
  const value = draft ?? derivedValue;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const iso = localInputValueToIso(value);
    const formData = new FormData();
    formData.set("ticketId", ticketId);
    formData.set("dueAt", iso ?? "");

    startTransition(async () => {
      const result = await updateAdminTicketDueAtAction(formData);
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
        <CardTitle className="text-base">Срок выполнения</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="admin-ticket-due-at-input" className="text-sm font-medium">
                Новый срок
              </label>
              <input
                id="admin-ticket-due-at-input"
                type="datetime-local"
                value={value}
                onChange={(event) => setDraft(event.target.value)}
                disabled={isPending}
                className={fieldClassName}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDraft("")}
              disabled={isPending || value === ""}
            >
              Очистить
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Сохранение…" : "Изменить срок"}
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Не удалось изменить срок</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {success ? (
            <Alert>
              <AlertTitle>Срок обновлён</AlertTitle>
            </Alert>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
