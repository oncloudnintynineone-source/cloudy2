import { describe, expect, it } from "vitest";

import { diffFields } from "./diff";

describe("diffFields", () => {
  it("reports changed fields as [before, after] pairs", () => {
    const result = diffFields({ name: "Alice", status: "active" }, { name: "Alice Tan", status: "active" });
    expect(result.changes).toEqual({ name: ["Alice", "Alice Tan"] });
  });

  it("ignores unchanged fields", () => {
    const result = diffFields(
      { name: "Alice", phone: "81234567", role: "user" },
      { name: "Alice", phone: "81234567", role: "user" },
    );
    expect(result.changes).toEqual({});
  });

  it("treats null and empty string as distinct", () => {
    const result = diffFields({ email: null }, { email: "" });
    expect(result.changes).toEqual({ email: [null, ""] });
  });

  it("detects added and removed fields", () => {
    const result = diffFields({ name: "Alice" }, { name: "Alice", departmentId: "abc" });
    expect(result.changes).toEqual({ departmentId: [undefined, "abc"] });
  });

  it("compares nested values by serialization", () => {
    const result = diffFields({ settings: { a: 1 } }, { settings: { a: 2 } });
    expect(result.changes).toEqual({ settings: [{ a: 1 }, { a: 2 }] });
  });

  it("returns before and after as-is", () => {
    const before = { name: "Alice" };
    const after = { name: "Alice Tan" };
    const result = diffFields(before, after);
    expect(result.before).toBe(before);
    expect(result.after).toBe(after);
  });
});
