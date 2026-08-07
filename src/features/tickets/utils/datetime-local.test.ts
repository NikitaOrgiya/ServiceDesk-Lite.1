import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { isoToLocalInputValue, localInputValueToIso } from "@/features/tickets/utils/datetime-local";

// These functions are explicitly "local timezone" conversions — testing
// them without pinning a timezone would make assertions depend on the CI
// runner's ambient TZ. Node re-resolves Date's local-time behavior from
// process.env.TZ on each call, so setting/restoring it here explicitly
// controls the conversion boundary instead of relying on the machine.
describe("datetime-local conversions (TZ pinned to UTC)", () => {
  let originalTz: string | undefined;

  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = "UTC";
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  describe("isoToLocalInputValue", () => {
    it("converts a UTC instant to the equivalent local (=UTC here) datetime-local value", () => {
      expect(isoToLocalInputValue("2026-08-07T15:00:00.000Z")).toBe("2026-08-07T15:00");
    });

    it("normalizes an offset-bearing instant to the same absolute point before reading local fields", () => {
      // 18:00+03:00 is the same absolute instant as 15:00Z.
      expect(isoToLocalInputValue("2026-08-07T18:00:00+03:00")).toBe("2026-08-07T15:00");
    });

    it("pads single-digit month/day/hour/minute", () => {
      expect(isoToLocalInputValue("2026-01-02T03:04:00.000Z")).toBe("2026-01-02T03:04");
    });

    it("returns an empty string for an unparseable instant, never throwing", () => {
      expect(isoToLocalInputValue("not-a-date")).toBe("");
    });
  });

  describe("localInputValueToIso", () => {
    it("converts a local datetime-local value to the equivalent absolute UTC instant", () => {
      expect(localInputValueToIso("2026-08-07T15:00")).toBe("2026-08-07T15:00:00.000Z");
    });

    it("returns null for an empty value (the explicit clear sentinel)", () => {
      expect(localInputValueToIso("")).toBeNull();
    });

    it("returns null for an invalid local datetime value, never throwing", () => {
      expect(localInputValueToIso("not-a-date")).toBeNull();
    });
  });

  describe("round-trip", () => {
    it("isoToLocalInputValue(localInputValueToIso(x)) preserves the wall-clock value", () => {
      const local = "2026-03-15T09:30";
      const iso = localInputValueToIso(local);
      expect(iso).not.toBeNull();
      expect(isoToLocalInputValue(iso as string)).toBe(local);
    });

    it("localInputValueToIso(isoToLocalInputValue(x)) preserves the absolute instant", () => {
      const iso = "2026-03-15T09:30:00.000Z";
      const local = isoToLocalInputValue(iso);
      expect(localInputValueToIso(local)).toBe(iso);
    });
  });
});
