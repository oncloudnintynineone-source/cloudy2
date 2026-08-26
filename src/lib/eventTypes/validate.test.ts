import { describe, expect, it } from "vitest";

import { validateEventTypeForm, type EventTypeFormValues } from "./validate";

const base: EventTypeFormValues = {
  name: "Leave",
  shortname: "LV",
  timeOptions: ["range", "full"],
  locationPolicy: "both",
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

  it("accepts all canonical location policies", () => {
    for (const policy of ["in", "out", "both"] as const) {
      expect(validateEventTypeForm({ ...base, locationPolicy: policy })).toEqual({});
    }
  });

  it("rejects an unknown location policy", () => {
    expect(
      validateEventTypeForm({
        ...base,
        locationPolicy: "camp" as EventTypeFormValues["locationPolicy"],
      }),
    ).toEqual({ locationPolicy: "Select a location policy" });
  });
});
