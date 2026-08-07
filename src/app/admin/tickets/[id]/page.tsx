import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { getAdminTicketDetail } from "@/features/tickets/queries/get-admin-ticket";
import { TicketDetails } from "@/features/tickets/components/ticket-details";
import { AdminTicketStatusForm } from "@/features/tickets/components/admin-ticket-status-form";
import { AdminTicketPriorityForm } from "@/features/tickets/components/admin-ticket-priority-form";

// Reads one RLS-scoped ticket per request — must never be statically cached.
export const dynamic = "force-dynamic";

type AdminTicketDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminTicketDetailPage({ params }: AdminTicketDetailPageProps) {
  const { id } = await params;

  const idResult = ticketIdSchema.safeParse(id);
  if (!idResult.success) {
    // An invalid UUID gets exactly the same 404 as a well-formed id that
    // doesn't resolve — see getAdminTicketDetail's own doc comment.
    notFound();
  }

  const ticket = await getAdminTicketDetail(idResult.data);

  if (!ticket) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: "Реестр заявок", href: "/admin/tickets" },
          { label: ticket.publicNumber },
        ]}
      />

      <h2 className="text-xl font-semibold">Заявка {ticket.publicNumber}</h2>

      <TicketDetails ticket={ticket} />

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminTicketStatusForm key={ticket.status} ticketId={ticket.id} currentStatus={ticket.status} />
        <AdminTicketPriorityForm
          key={ticket.priority}
          ticketId={ticket.id}
          currentPriority={ticket.priority}
        />
      </div>
    </div>
  );
}
