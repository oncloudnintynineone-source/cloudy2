import { describe, expect, it } from "vitest";

import { firstErrorField } from "./validationFeedback";

describe("firstErrorField", () => {
  it("returns the first field with a non-empty error in record order", () => {
    expect(
      firstErrorField({
        name: "Name is required",
        shortname: "Shortname is required",
        phone: "Phone must be exactly 8 digits",
      }),
    ).toBe("name");
  });

  it("skips fields whose error is empty, null, or undefined", () => {
    expect(
      firstErrorField({
        name: "",
        shortname: undefined,
        phone: null,
        email: "Enter a valid email or leave it blank",
      }),
    ).toBe("email");
  });

  it("returns null when no field has an error", () => {
    expect(firstErrorField({})).toBeNull();
    expect(firstErrorField({ name: undefined, shortname: "" })).toBeNull();
  });
});
