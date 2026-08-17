import { describe, expect, it } from "vitest";

import { validateEventTypeForm, type EventTypeFormValues } from "./validate";

const base: EventTypeFormValues = {
  name: "Leave",
  shortname: "LV",
  timeOptions: ["range", "full"],
};

describe("validateEventTypeForm", () => {
  it("accepts a non-blank name and shortname with at least one time option", () => {
    expect(validateEventTypeForm(base)).toEqual({});
  });

  it("rejects a blank name", () => {
    expect(validateEventTypeForm({ ...base, name: "" })).toEqual({
      name: "Name is required",
    });
  });

  it("rejects a whitespace-only name", () => {
    expect(validateEventTypeForm({ ...base, name: "   " })).toEqual({
      name: "Name is required",
    });
  });

  it("rejects a blank shortname", () => {
    expect(validateEventTypeForm({ ...base, shortname: "" })).toEqual({
      shortname: "Shortname is required",
    });
  });

  it("rejects a whitespace-only shortname", () => {
    expect(validateEventTypeForm({ ...base, shortname: "   " })).toEqual({
      shortname: "Shortname is required",
    });
  });

  it("requires at least one time option", () => {
    expect(validateEventTypeForm({ ...base, timeOptions: [] })).toEqual({
      timeOptions: "Select at least one time option",
    });
  });
});
