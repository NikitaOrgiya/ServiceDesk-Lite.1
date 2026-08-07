import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { getAdminTicketDetail } from "@/features/tickets/queries/get-admin-ticket";
import { getAdminAssigneeOptions } from "@/features/tickets/queries/get-admin-assignee-options";
import { getAdminTicketComments } from "@/features/tickets/queries/get-admin-ticket-comments";
import { getAdminTicketHistory } from "@/features/tickets/queries/get-admin-ticket-history";
import { TicketDetails } from "@/features/tickets/components/ticket-details";
import { TicketComments } from "@/features/tickets/components/ticket-comments";
import { TicketHistory } from "@/features/tickets/components/ticket-history";
import { AdminTicketStatusForm } from "@/features/tickets/components/admin-ticket-status-form";
import { AdminTicketPriorityForm } from "@/features/tickets/components/admin-ticket-priority-form";
import { AdminTicketAssigneeForm } from "@/features/tickets/components/admin-ticket-assignee-form";
import { AdminTicketDueAtForm } from "@/features/tickets/components/admin-ticket-due-at-form";
import { addAdminTicketCommentAction } from "@/features/tickets/actions/add-admin-ticket-comment";

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

  // Ticket-missing, assignee-options-failed, comments-failed, and
  // history-failed are all independent failure modes: every one of these
  // functions returns null/[] (never throws) on its own failure, so
  // Promise.all here can't let any of them masquerade as another's; only a
  // missing/inaccessible *ticket* 404s the page. Comments/history failures
  // just render as an empty list — same degrade-gracefully contract the
  // employee route's getEmployeeTicketDetail already follows internally.
  const [ticket, assigneeOptions, comments, history] = await Promise.all([
    getAdminTicketDetail(idResult.data),
    getAdminAssigneeOptions(),
    getAdminTicketComments(idResult.data),
    getAdminTicketHistory(idResult.data),
  ]);

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
        <AdminTicketAssigneeForm
          key={ticket.assigneeId ?? "unassigned"}
          ticketId={ticket.id}
          currentAssigneeId={ticket.assigneeId}
          currentAssigneeName={ticket.assigneeName}
          assigneeOptions={assigneeOptions}
        />
        <AdminTicketDueAtForm key={ticket.dueAt ?? "unset"} ticketId={ticket.id} currentDueAt={ticket.dueAt} />
      </div>

      <TicketComments ticketId={ticket.id} comments={comments} action={addAdminTicketCommentAction} />
      <TicketHistory history={history} />
    </div>
  );
}
