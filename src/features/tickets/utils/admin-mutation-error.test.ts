import { describe, expect, it } from "vitest";

import { mapAdminMutationErrorCode } from "@/features/tickets/utils/admin-mutation-error";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";

describe("mapAdminMutationErrorCode", () => {
  it("maps 22023 to the caller-supplied invalid-argument message", () => {
    const message = mapAdminMutationErrorCode("22023", "generic fallback", "invalid transition");
    expect(message).toBe("invalid transition");
  });

  it("22023 falls back to fallbackMessage when no invalidArgumentMessage is given", () => {
    const message = mapAdminMutationErrorCode("22023", "generic fallback");
    expect(message).toBe("generic fallback");
  });

  it("maps P0002 to the canonical not-found message, ignoring fallback/invalidArgument", () => {
    const message = mapAdminMutationErrorCode("P0002", "generic fallback", "invalid transition");
    expect(message).toBe(getTicketErrorMessage("adminTicketNotFound"));
  });

  it("maps 42501 to the canonical not-authorized message", () => {
    const message = mapAdminMutationErrorCode("42501", "generic fallback", "invalid transition");
    expect(message).toBe(getTicketErrorMessage("adminNotAuthorized"));
  });

  it("maps an unrecognized code to fallbackMessage", () => {
    const message = mapAdminMutationErrorCode("XXYYY", "generic fallback", "invalid transition");
    expect(message).toBe("generic fallback");
  });

  it("maps an undefined code (no code on the thrown error) to fallbackMessage", () => {
    const message = mapAdminMutationErrorCode(undefined, "generic fallback");
    expect(message).toBe("generic fallback");
  });

  it("never returns the raw SQLSTATE or any recognizable internal wording", () => {
    for (const code of ["22023", "P0002", "42501", "unknown", undefined]) {
      const message = mapAdminMutationErrorCode(code, "generic fallback", "invalid transition");
      expect(message).not.toMatch(/22023|P0002|42501/);
      expect(message).not.toMatch(/transition:.*->/i);
    }
  });

  describe("extraCodeMessages (e.g. 23514 for the assignee mutation)", () => {
    it("maps a code present in extraCodeMessages to its supplied message", () => {
      const message = mapAdminMutationErrorCode("23514", "generic fallback", "generic fallback", {
        "23514": "assignee unavailable",
      });
      expect(message).toBe("assignee unavailable");
    });

    it("extraCodeMessages takes priority over the built-in P0002/42501/22023 cases", () => {
      const message = mapAdminMutationErrorCode("P0002", "generic fallback", "invalid transition", {
        P0002: "overridden not-found",
      });
      expect(message).toBe("overridden not-found");
    });

    it("a code absent from extraCodeMessages falls through to the built-in cases unchanged", () => {
      const message = mapAdminMutationErrorCode("42501", "generic fallback", "generic fallback", {
        "23514": "assignee unavailable",
      });
      expect(message).toBe(getTicketErrorMessage("adminNotAuthorized"));
    });

    it("omitting extraCodeMessages entirely behaves exactly as before (status/priority call sites unaffected)", () => {
      const message = mapAdminMutationErrorCode("22023", "generic fallback", "invalid transition");
      expect(message).toBe("invalid transition");
    });
  });
});
