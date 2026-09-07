import { describe, it, expect } from "vitest";
import { normalizeFixes } from "@/lib/ai/jobs";

describe("normalizeFixes", () => {
  it("accepts {fixes:[...]} shape", () => {
    const out = normalizeFixes(
      JSON.stringify({ fixes: [{ rowIndex: 1, column: "Email", action: "set", newValue: "a@x.com" }] }),
      [1, 3]
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rowIndex: 1, action: "set" });
  });

  it("accepts bare array (Groq json_object behavior)", () => {
    const out = normalizeFixes(
      `[{"rowIndex":1,"column":"Email","action":"delete_row"},{"rowIndex":3,"column":"Email","action":"delete_row"}]`,
      [1, 3]
    );
    expect(out).toHaveLength(2);
  });

  it("drops rows outside the issue set", () => {
    const out = normalizeFixes(
      JSON.stringify({ fixes: [{ rowIndex: 99, column: "Email", action: "set", newValue: "x" }] }),
      [1, 3]
    );
    expect(out).toHaveLength(0);
  });
});
