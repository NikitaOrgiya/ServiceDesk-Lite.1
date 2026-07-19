import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.email("Введите корректный email"),
  password: z.string().min(1, "Введите пароль"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
