import { describe, expect, it } from "vitest";

import { buildContactsVcf } from "./vcf";

describe("buildContactsVcf", () => {
  it("renders a single contact with name and phone", () => {
    const vcf = buildContactsVcf([{ name: "John Lai", departmentName: null, phone: "81234567" }], "{name}");
    expect(vcf).toBe(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "FN:John Lai",
        "TEL;TYPE=CELL:81234567",
        "END:VCARD",
      ].join("\n"),
    );
  });

  it("resolves the full name through the display-name template", () => {
    const vcf = buildContactsVcf(
      [{ name: "John Lai", departmentName: "Engineering 1", phone: "81234567" }],
      "{name} ({department})",
    );
    expect(vcf).toContain("FN:John Lai (Engineering 1)");
  });

  it("escapes VCF text-field characters in the name", () => {
    const vcf = buildContactsVcf(
      [{ name: "Doe, John; \"Jr\" \\ Boss", departmentName: null, phone: "81234567" }],
      "{name}",
    );
    expect(vcf).toContain("FN:Doe\\, John\\; \"Jr\" \\\\ Boss");
  });

  it("separates multiple contacts with a blank line", () => {
    const vcf = buildContactsVcf(
      [
        { name: "Ann", departmentName: null, phone: "81234567" },
        { name: "Bob", departmentName: null, phone: "82345678" },
      ],
      "{name}",
    );
    expect(vcf.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(vcf.split("\n\n")).toHaveLength(2);
  });

  it("returns an empty string for no users", () => {
    expect(buildContactsVcf([], "{name}")).toBe("");
  });
});
