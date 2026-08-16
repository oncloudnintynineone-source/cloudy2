import { describe, expect, it } from "vitest";

import { validateEventTypeForm } from "./validate";

describe("validateEventTypeForm", () => {
  it("accepts a non-blank name", () => {
    expect(validateEventTypeForm({ name: "Leave" })).toEqual({});
  });

  it("rejects a blank name", () => {
    expect(validateEventTypeForm({ name: "" })).toEqual({ name: "Name is required" });
  });

  it("rejects a whitespace-only name", () => {
    expect(validateEventTypeForm({ name: "   " })).toEqual({ name: "Name is required" });
  });
});
