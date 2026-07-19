export const USER_ROLES = ["employee", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

const ROLE_LABELS: Record<UserRole, string> = {
  employee: "Сотрудник",
  admin: "Администратор",
};

export function formatRole(role: UserRole): string {
  return ROLE_LABELS[role];
}
