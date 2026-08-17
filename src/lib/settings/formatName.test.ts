import { describe, expect, it } from "vitest";

import { formatFullName } from "./formatName";

const base = { name: "John Lai", departmentName: "Engineering 1" };

describe("formatFullName", () => {
  it("replaces {name} and {department}", () => {
    expect(formatFullName(base, "{name}: DEPT-{department}")).toBe(
      "John Lai: DEPT-Engineering 1",
    );
  });

  it("substitutes placeholder names case-insensitively", () => {
    expect(formatFullName(base, "{NAME} ({Department})")).toBe("John Lai (Engineering 1)");
    expect(formatFullName(base, "{Name}/{DEPARTMENT}")).toBe("John Lai/Engineering 1");
  });

  it("renders a missing department as an empty string", () => {
    expect(formatFullName({ name: "John Lai", departmentName: null }, "{name} ({department})")).toBe(
      "John Lai ()",
    );
  });

  it("leaves unknown tokens as literal text", () => {
    expect(formatFullName(base, "{name} [{nickname}]")).toBe("John Lai [{nickname}]");
  });

  it("replaces repeated tokens everywhere", () => {
    expect(formatFullName(base, "{name} | {name}")).toBe("John Lai | John Lai");
  });

  it("trims surrounding whitespace in the result", () => {
    expect(formatFullName(base, "  {name}  ")).toBe("John Lai");
  });

  it("renders an empty template as an empty string", () => {
    expect(formatFullName(base, "")).toBe("");
  });

  it("keeps literal text with no placeholders", () => {
    expect(formatFullName(base, "Staff")).toBe("Staff");
  });

  it("handles an empty name", () => {
    expect(formatFullName({ name: "", departmentName: "Ops" }, "{name}-{department}")).toBe("-Ops");
  });
});
