import type { UserRole } from "@/features/auth/roles";

/**
 * Minimal, serializable view of the current profile — safe to pass from a
 * Server Component (layout) into a Client Component (header/sidebar). Never
 * pass the Supabase `User`/`Session` object itself: it carries far more
 * than the UI needs, including things that must stay server-side.
 */
export type ProfileViewModel = {
  fullName: string;
  role: UserRole;
  department: string | null;
};
