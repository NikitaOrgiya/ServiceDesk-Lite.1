import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { getEmployeeTicketDetail } from "@/features/tickets/queries/get-employee-ticket";
import { canCancelTicket } from "@/features/tickets/utils/can-cancel-ticket";
import { TicketDetails } from "@/features/tickets/components/ticket-details";
import { TicketComments } from "@/features/tickets/components/ticket-comments";
import { TicketHistory } from "@/features/tickets/components/ticket-history";
import { CancelTicketButton } from "@/features/tickets/components/cancel-ticket-button";
import { addTicketCommentAction } from "@/features/tickets/actions/add-ticket-comment";

// Reads one RLS-scoped ticket per request — must never be statically cached.
export const dynamic = "force-dynamic";

type TicketDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const { id } = await params;

  const idResult = ticketIdSchema.safeParse(id);
  if (!idResult.success) {
    // An invalid UUID gets exactly the same 404 as a well-formed id that
    // doesn't resolve — see getEmployeeTicketDetail's own doc comment.
    notFound();
  }

  const result = await getEmployeeTicketDetail(idResult.data);

  if (!result) {
    notFound();
  }

  const { ticket, comments, history } = result;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: "Мои заявки", href: "/app/tickets" },
          { label: ticket.publicNumber },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Заявка {ticket.publicNumber}</h2>
        {canCancelTicket(ticket.status) ? (
          <CancelTicketButton ticketId={ticket.id} ticketNumber={ticket.publicNumber} />
        ) : null}
      </div>

      <TicketDetails ticket={ticket} />
      <TicketComments ticketId={ticket.id} comments={comments} action={addTicketCommentAction} />
      <TicketHistory history={history} />
    </div>
  );
}
