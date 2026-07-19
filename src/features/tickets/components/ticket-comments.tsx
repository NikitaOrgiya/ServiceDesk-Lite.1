import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatRole } from "@/features/auth/roles";
import { formatDateTime } from "@/features/tickets/utils/format-date";
import { CommentForm } from "@/features/tickets/components/comment-form";
import type { TicketCommentItem } from "@/features/tickets/types/ticket";

type TicketCommentsProps = {
  ticketId: string;
  comments: TicketCommentItem[];
};

export function TicketComments({ ticketId, comments }: TicketCommentsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Комментарии ({comments.length})</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Комментариев пока нет.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {comments.map((comment, index) => (
              <li key={comment.id}>
                {index > 0 ? <Separator className="mb-4" /> : null}
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {comment.authorName}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({formatRole(comment.authorRole)})
                    </span>
                  </span>
                  <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">
                    {formatDateTime(comment.createdAt)}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{comment.message}</p>
              </li>
            ))}
          </ul>
        )}

        <Separator />

        <CommentForm ticketId={ticketId} />
      </CardContent>
    </Card>
  );
}
