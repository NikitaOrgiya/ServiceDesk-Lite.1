import { describe, expect, it } from "vitest";

import { resolveAdminAssigneeSelectState } from "@/features/tickets/utils/admin-assignee-select";

describe("resolveAdminAssigneeSelectState", () => {
  it("treats no current assignee as known-active (nothing to reconcile)", () => {
    const state = resolveAdminAssigneeSelectState(null, [{ id: "p1", fullName: "Alice" }]);
    expect(state.currentIsKnownActive).toBe(true);
  });

  it("treats a current assignee present in the active options as known-active", () => {
    const state = resolveAdminAssigneeSelectState("p1", [{ id: "p1", fullName: "Alice" }]);
    expect(state.currentIsKnownActive).toBe(true);
    expect(state.options).toEqual([{ id: "p1", fullName: "Alice" }]);
  });

  it("identity is decided by id, not by full_name — a duplicate name at a different id is NOT a match", () => {
    // Two different profiles happen to share the display name "Иван Иванов".
    const options = [
      { id: "p-real-current", fullName: "Иван Иванов" },
      { id: "p-other", fullName: "Иван Иванов" },
    ];
    const state = resolveAdminAssigneeSelectState("p-real-current", options);
    expect(state.currentIsKnownActive).toBe(true);

    // A current id that isn't in the list is NOT considered active just
    // because some option happens to share its name.
    const stateMismatch = resolveAdminAssigneeSelectState("p-not-in-list", options);
    expect(stateMismatch.currentIsKnownActive).toBe(false);
  });

  it("a current assignee absent from the active options is never silently treated as active or dropped from view", () => {
    const state = resolveAdminAssigneeSelectState("inactive-profile", [
      { id: "p1", fullName: "Alice" },
      { id: "p2", fullName: "Bob" },
    ]);

    expect(state.currentIsKnownActive).toBe(false);
    // The active options list itself is untouched — no silent substitution
    // of "inactive-profile" with the first active option (p1).
    expect(state.options).toEqual([
      { id: "p1", fullName: "Alice" },
      { id: "p2", fullName: "Bob" },
    ]);
  });

  it("options query failure (null) is reported distinctly from an empty-but-successful result", () => {
    const failed = resolveAdminAssigneeSelectState("p1", null);
    expect(failed.optionsUnavailable).toBe(true);
    expect(failed.options).toEqual([]);

    const empty = resolveAdminAssigneeSelectState(null, []);
    expect(empty.optionsUnavailable).toBe(false);
    expect(empty.options).toEqual([]);
  });

  it("a failed options query never marks a real current assignee as known-active", () => {
    const state = resolveAdminAssigneeSelectState("p1", null);
    expect(state.optionsUnavailable).toBe(true);
    expect(state.currentIsKnownActive).toBe(false);
  });

  it("options are returned with id and fullName only — never any other field, and ids are never derived from names", () => {
    const options = [{ id: "p1", fullName: "Alice" }];
    const state = resolveAdminAssigneeSelectState(null, options);
    expect(Object.keys(state.options[0]).sort()).toEqual(["fullName", "id"]);
  });
});
