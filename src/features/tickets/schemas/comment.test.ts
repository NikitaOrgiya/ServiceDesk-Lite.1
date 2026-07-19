import { describe, expect, it } from "vitest";

import { addCommentSchema } from "@/features/tickets/schemas/comment";

describe("addCommentSchema", () => {
  it("accepts a normal message", () => {
    expect(addCommentSchema.safeParse({ message: "Проверил, проблема воспроизводится." }).success).toBe(
      true
    );
  });

  it("trims the message", () => {
    const result = addCommentSchema.safeParse({ message: "  привет  " });
    expect(result.success).toBe(true);
    expect(result.success && result.data.message).toBe("привет");
  });

  it("rejects an empty message", () => {
    expect(addCommentSchema.safeParse({ message: "" }).success).toBe(false);
    expect(addCommentSchema.safeParse({ message: "   " }).success).toBe(false);
  });

  it("accepts a message at exactly 3000 characters", () => {
    expect(addCommentSchema.safeParse({ message: "а".repeat(3000) }).success).toBe(true);
  });

  it("rejects a message longer than 3000 characters", () => {
    expect(addCommentSchema.safeParse({ message: "а".repeat(3001) }).success).toBe(false);
  });
});
