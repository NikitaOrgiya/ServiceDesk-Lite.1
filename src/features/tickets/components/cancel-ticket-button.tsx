"use client";

import { useState, useTransition } from "react";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cancelTicketAction } from "@/features/tickets/actions/cancel-ticket";

type CancelTicketButtonProps = {
  ticketId: string;
  ticketNumber: string;
};

/**
 * Only rendered by the caller when `status === 'new'` — but that is a UX
 * nicety, not the real protection. `cancelTicketAction` re-checks
 * ownership and status server-side via `public.cancel_own_ticket`
 * regardless of whether this button was ever shown.
 */
export function CancelTicketButton({ ticketId, ticketNumber }: CancelTicketButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelTicketAction(ticketId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Ban />
          Отменить заявку
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отменить заявку {ticketNumber}?</DialogTitle>
          <DialogDescription>
            Это действие нельзя отменить обратно. Заявка будет отмечена как отменённая.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Не удалось отменить заявку</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Не отменять
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Отмена…" : "Да, отменить заявку"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
