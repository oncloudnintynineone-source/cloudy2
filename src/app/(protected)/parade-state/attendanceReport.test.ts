import { describe, expect, it } from "vitest";

import {
  buildAttendanceReport,
  resolveEventTypeTag,
  type AttendanceReportDepartment,
} from "./attendanceReport";

const departments: AttendanceReportDepartment[] = [
  {
    name: "Logistics",
    users: [
      { id: "u1", name: "Alice Tan", eventTags: [] },
      { id: "u2", name: "Bob Ng", eventTags: ["SITE"] },
      { id: "u3", name: "Carol Lim", eventTags: ["NSC", "MC"] },
    ],
  },
  {
    name: "Operations",
    users: [{ id: "u4", name: "David Koh", eventTags: [] }],
  },
];

describe("buildAttendanceReport", () => {
  it("renders headers with checked/total and suffixes per check state", () => {
    const text = buildAttendanceReport(departments, new Set(["u1", "u2"]));
    expect(text).toBe(
      [
        "Logistics (2 of 3)",
        "Alice Tan",
        "Bob Ng - (SITE)",
        "Carol Lim - Absent",
        "",
        "Operations (0 of 1)",
        "David Koh - Absent",
      ].join("\n"),
    );
  });

  it("marks every user absent when nothing is checked", () => {
    expect(buildAttendanceReport(departments, new Set())).toContain(
      "Operations (0 of 1)\nDavid Koh - Absent",
    );
  });

  it("marks an unchecked event-tagged user as Absent only (absent wins)", () => {
    const text = buildAttendanceReport([departments[0]], new Set());
    expect(text).toContain("Carol Lim - Absent");
    expect(text).not.toContain("(NSC");
    expect(text).not.toContain("(MC");
  });

  it("joins multiple tags comma-separated for a checked user", () => {
    const text = buildAttendanceReport([departments[0]], new Set(["u1", "u3"]));
    expect(text).toContain("Carol Lim - (NSC, MC)");
    expect(text).toContain("Logistics (2 of 3)");
  });

  it("keeps department and user order as given", () => {
    const reversed: AttendanceReportDepartment[] = [
      departments[1],
      { ...departments[0], users: [...departments[0].users].reverse() },
    ];
    const text = buildAttendanceReport(reversed, new Set());
    const lines = text.split("\n");
    expect(lines[0]).toBe("Operations (0 of 1)");
    expect(lines[1]).toBe("David Koh - Absent");
    expect(lines[3]).toBe("Logistics (0 of 3)");
    expect(lines[4]).toBe("Carol Lim - Absent");
    expect(lines[6]).toBe("Alice Tan - Absent");
  });

  it("skips empty departments", () => {
    const withEmpty: AttendanceReportDepartment[] = [
      { name: "Empty", users: [] },
      ...departments,
      { name: "Also Empty", users: [] },
    ];
    expect(buildAttendanceReport(withEmpty, new Set(["u1"]))).toBe(
      buildAttendanceReport(departments, new Set(["u1"])),
    );
  });

  it("returns an empty string when every department is empty", () => {
    expect(buildAttendanceReport([{ name: "Empty", users: [] }], new Set())).toBe("");
  });

  it("ignores checked ids of users outside the given departments", () => {
    expect(buildAttendanceReport(departments, new Set(["u1", "ghost"]))).toContain(
      "Logistics (1 of 3)",
    );
  });
});

describe("resolveEventTypeTag", () => {
  const acronyms = { Leave: null, Training: "TRN" };

  it("prefers the registry shortname", () => {
    expect(resolveEventTypeTag("Training", "Some title", acronyms)).toBe("TRN");
  });

  it("falls back to the raw type name when unknown to the registry", () => {
    expect(resolveEventTypeTag("Field Trip", "Some title", acronyms)).toBe("Field Trip");
  });

  it("falls back to the type name when the shortname is blank", () => {
    expect(resolveEventTypeTag("Leave", "Some title", acronyms)).toBe("Leave");
  });

  it("falls back to the title when the event has no type", () => {
    expect(resolveEventTypeTag(null, "Some title", acronyms)).toBe("Some title");
  });
});
