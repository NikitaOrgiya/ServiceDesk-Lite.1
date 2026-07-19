import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewTicketForm } from "@/features/tickets/components/new-ticket-form";

export default function NewTicketPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Новая заявка</h2>
        <p className="text-sm text-muted-foreground">
          Опишите проблему — служба поддержки свяжется с вами после обработки
          заявки.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Детали обращения</CardTitle>
          <CardDescription>
            Все поля обязательны для заполнения.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewTicketForm />
        </CardContent>
      </Card>
    </div>
  );
}
