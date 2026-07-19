import { Badge } from "@/components/ui/badge";
import { formatStatus } from "@/features/tickets/utils/labels";
import type { TicketStatus } from "@/features/tickets/types/ticket";
import { cn } from "@/lib/utils";

const STATUS_CLASSNAMES: Record<TicketStatus, string> = {
  new: "border-transparent bg-blue-100 text-blue-800",
  accepted: "border-transparent bg-sky-100 text-sky-800",
  in_progress: "border-transparent bg-amber-100 text-amber-800",
  waiting: "border-transparent bg-purple-100 text-purple-800",
  resolved: "border-transparent bg-green-100 text-green-800",
  closed: "border-transparent bg-gray-200 text-gray-700",
  cancelled: "border-transparent bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge className={cn(STATUS_CLASSNAMES[status])}>{formatStatus(status)}</Badge>;
}
