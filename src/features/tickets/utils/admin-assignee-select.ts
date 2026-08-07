import type { AdminAssigneeOption } from "@/features/tickets/queries/get-admin-assignee-options";

export type AdminAssigneeSelectState = {
  /** Active profiles to render as ordinary selectable options — `[]` both when there are none and when the options query failed (see `optionsUnavailable`). */
  options: AdminAssigneeOption[];
  /** True only when the options query itself failed — distinct from "query succeeded, zero active profiles". */
  optionsUnavailable: boolean;
  /**
   * True when there is no current assignee, or the current assignee's id
   * is present among `options` — identity is decided by id only, **never**
   * by matching full_name (two profiles can share a display name). False
   * means the current assignee is a real id not present in the active
   * list (inactive, or the options query failed), so the UI must not
   * silently drop or replace that selection with the first active option.
   */
  currentIsKnownActive: boolean;
};

/**
 * Pure decision logic behind AdminTicketAssigneeForm's <select> — kept
 * separate from the component so the "never silently substitute an
 * inactive current assignee" and "identity is by id, not by name"
 * invariants are unit-testable without a React Testing Library setup.
 */
export function resolveAdminAssigneeSelectState(
  currentAssigneeId: string | null,
  assigneeOptions: AdminAssigneeOption[] | null
): AdminAssigneeSelectState {
  const optionsUnavailable = assigneeOptions === null;
  const options = assigneeOptions ?? [];
  const currentIsKnownActive =
    currentAssigneeId === null || options.some((option) => option.id === currentAssigneeId);

  return { options, optionsUnavailable, currentIsKnownActive };
}
