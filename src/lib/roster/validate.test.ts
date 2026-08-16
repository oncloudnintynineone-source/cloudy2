import { describe, expect, it } from "vitest";

import { normalizePhone, validateDepartmentForm, validateUserForm } from "./validate";

describe("normalizePhone", () => {
  it("keeps a plain 8-digit number", () => {
    expect(normalizePhone("81234567")).toBe("81234567");
  });

  it("strips internal spaces and dashes", () => {
    expect(normalizePhone("8123 4567")).toBe("81234567");
    expect(normalizePhone("8123-4567")).toBe("81234567");
  });

  it("rejects a full number with country code", () => {
    expect(normalizePhone("+65 8123 4567")).toBeNull();
    expect(normalizePhone("65-8123-4567")).toBeNull();
  });

  it("returns null for too few digits", () => {
    expect(normalizePhone("12345")).toBeNull();
  });

  it("returns null for too many digits", () => {
    expect(normalizePhone("123456789")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(normalizePhone("")).toBeNull();
  });
});

describe("validateUserForm", () => {
  const valid = {
    name: "Alice Tan",
    phone: "81234567",
    email: "alice@example.com",
    birthday: "1990-01-01",
    role: "user" as const,
    status: "active" as const,
    departmentIds: ["dept-1"],
    primaryDepartmentId: "dept-1",
  };

  it("passes a valid form", () => {
    expect(validateUserForm(valid)).toEqual({});
  });

  it("requires a name", () => {
    expect(validateUserForm({ ...valid, name: "   " }).name).toBeTruthy();
  });

  it("requires an 8-digit phone", () => {
    expect(validateUserForm({ ...valid, phone: "123" }).phone).toBeTruthy();
  });

  it("rejects an invalid email but allows blank", () => {
    expect(validateUserForm({ ...valid, email: "not-an-email" }).email).toBeTruthy();
    expect(validateUserForm({ ...valid, email: "" }).email).toBeUndefined();
  });

  it("requires a primary department when departments are selected", () => {
    expect(
      validateUserForm({ ...valid, primaryDepartmentId: null }).primaryDepartmentId,
    ).toBeTruthy();
  });

  it("requires the primary department to be one of the selected ones", () => {
    expect(
      validateUserForm({ ...valid, primaryDepartmentId: "dept-other" }).primaryDepartmentId,
    ).toBeTruthy();
  });

  it("does not require a primary department when none are selected", () => {
    expect(
      validateUserForm({ ...valid, departmentIds: [], primaryDepartmentId: null })
        .primaryDepartmentId,
    ).toBeUndefined();
  });
});

describe("validateDepartmentForm", () => {
  it("passes a valid form", () => {
    expect(validateDepartmentForm({ name: "Ops", sortOrder: 0 })).toEqual({});
  });

  it("requires a name", () => {
    expect(validateDepartmentForm({ name: "  ", sortOrder: 0 }).name).toBeTruthy();
  });
});
