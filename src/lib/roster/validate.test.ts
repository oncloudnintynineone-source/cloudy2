import { describe, expect, it } from "vitest";

import {
  normalizePhone,
  validateCalendarForm,
  validateUserForm,
  type UserFormValues,
} from "./validate";

describe("normalizePhone", () => {
  it("strips non-digits and keeps 8 digits", () => {
    expect(normalizePhone("8123 4567")).toBe("81234567");
    expect(normalizePhone("8123-4567")).toBe("81234567");
  });

  it("returns null when a country code pushes the digit count over 8", () => {
    expect(normalizePhone("+65 81234567")).toBeNull();
  });

  it("returns null for too few or too many digits", () => {
    expect(normalizePhone("8123456")).toBeNull();
    expect(normalizePhone("812345678")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
});

describe("validateUserForm", () => {
  const base: UserFormValues = {
    name: "Alice Tan",
    shortname: "ALICE",
    phone: "81234567",
    email: "alice@example.com",
    birthday: "1991-03-15",
    role: "user",
    status: "active",
    departmentId: "dept-1",
  };

  it("accepts a complete valid form", () => {
    expect(validateUserForm(base)).toEqual({});
  });

  it("requires a name", () => {
    expect(validateUserForm({ ...base, name: "  " }).name).toBe("Name is required");
  });

  it("requires a shortname", () => {
    expect(validateUserForm({ ...base, shortname: "  " }).shortname).toBe(
      "Shortname is required",
    );
    expect(validateUserForm({ ...base, shortname: "" }).shortname).toBe(
      "Shortname is required",
    );
  });

  it("requires an exactly-8-digit phone", () => {
    expect(validateUserForm({ ...base, phone: "1234" }).phone).toBe(
      "Phone must be exactly 8 digits",
    );
  });

  it("validates email format and allows blank email", () => {
    expect(validateUserForm({ ...base, email: "not-an-email" }).email).toBe(
      "Enter a valid email or leave it blank",
    );
    expect(validateUserForm({ ...base, email: "" }).email).toBeUndefined();
  });

  it("allows a null department (user unassigned)", () => {
    expect(validateUserForm({ ...base, departmentId: null })).toEqual({});
  });
});

describe("validateCalendarForm", () => {
  it("accepts a name", () => {
    expect(validateCalendarForm({ name: "Operations" })).toEqual({});
  });

  it("requires a name", () => {
    expect(validateCalendarForm({ name: "" }).name).toBe("Name is required");
    expect(validateCalendarForm({ name: "   " }).name).toBe("Name is required");
  });
});
