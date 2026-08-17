import { describe, expect, it } from "vitest";

import { validateEventTypeForm } from "./validate";

describe("validateEventTypeForm", () => {
  it("accepts a non-blank name and shortname", () => {
    expect(validateEventTypeForm({ name: "Leave", shortname: "LV" })).toEqual({});
  });

  it("rejects a blank name", () => {
    expect(validateEventTypeForm({ name: "", shortname: "LV" })).toEqual({
      name: "Name is required",
    });
  });

  it("rejects a whitespace-only name", () => {
    expect(validateEventTypeForm({ name: "   ", shortname: "LV" })).toEqual({
      name: "Name is required",
    });
  });

  it("rejects a blank shortname", () => {
    expect(validateEventTypeForm({ name: "Leave", shortname: "" })).toEqual({
      shortname: "Shortname is required",
    });
  });

  it("rejects a whitespace-only shortname", () => {
    expect(validateEventTypeForm({ name: "Leave", shortname: "   " })).toEqual({
      shortname: "Shortname is required",
    });
  });
});
