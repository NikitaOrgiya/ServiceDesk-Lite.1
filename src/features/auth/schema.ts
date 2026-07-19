import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.email("Введите корректный email"),
  password: z.string().min(1, "Введите пароль"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const passwordResetRequestSchema = z.object({
  email: z.email("Введите корректный email"),
});

export type PasswordResetRequestValues = z.infer<typeof passwordResetRequestSchema>;

const MIN_PASSWORD_LENGTH = 8;

export const newPasswordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD_LENGTH, "Пароль должен содержать не менее 8 символов"),
    confirmPassword: z.string().min(1, "Подтвердите пароль"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
