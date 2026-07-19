import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger/logger";

describe("logger", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("emits a structured JSON line with the event and a timestamp", () => {
    logger.error({
      event: "tickets:list_failed",
      message: "Could not load tickets",
      code: "PGRST116",
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);

    expect(parsed.event).toBe("tickets:list_failed");
    expect(parsed.message).toBe("Could not load tickets");
    expect(parsed.code).toBe("PGRST116");
    expect(parsed.level).toBe("error");
    expect(typeof parsed.timestamp).toBe("string");
  });
});
