import { Badge } from "@/components/ui/badge";
import { formatPriority } from "@/features/tickets/utils/labels";
import type { TicketPriority } from "@/features/tickets/schemas/create-ticket";
import { cn } from "@/lib/utils";

const PRIORITY_CLASSNAMES: Record<TicketPriority, string> = {
  low: "border-transparent bg-gray-100 text-gray-700",
  normal: "border-transparent bg-slate-100 text-slate-700",
  high: "border-transparent bg-orange-100 text-orange-800",
  critical: "border-transparent bg-red-100 text-red-800",
};

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <Badge className={cn(PRIORITY_CLASSNAMES[priority])}>{formatPriority(priority)}</Badge>;
}
