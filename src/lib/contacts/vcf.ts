/**
 * Pure helper that renders the active roster as a vCard (VCF 3.0) file for
 * bulk download. Kept free of I/O so it can be unit-tested without a DB.
 */

import { formatFullName } from "@/lib/settings/formatName";

export interface VcfContactInput {
  name: string;
  departmentName: string | null;
  phone: string;
}

/** Escape VCF 3.0 text-field characters (`\`, `;`, `,`, and newlines). */
function escapeVcfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * Build the full `.vcf` file body. Each contact carries only the formatted
 * full name (from the display-name template) and the phone number.
 */
export function buildContactsVcf(users: VcfContactInput[], nameTemplate: string): string {
  return users
    .map((user) => {
      const fullName = formatFullName(
        { name: user.name, departmentName: user.departmentName },
        nameTemplate,
      );
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${escapeVcfText(fullName)}`,
        `TEL;TYPE=CELL:${user.phone}`,
        "END:VCARD",
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}
