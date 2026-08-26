import { describe, expect, it } from "vitest";

import { buildAttendanceReport, type AttendanceReportDepartment } from "./attendanceReport";

const departments: AttendanceReportDepartment[] = [
  {
    name: "Logistics",
    users: [
      { id: "u1", name: "Alice Tan" },
      { id: "u2", name: "Bob Ng" },
      { id: "u3", name: "Carol Lim" },
    ],
  },
  {
    name: "Operations",
    users: [{ id: "u4", name: "David Koh" }],
  },
];

describe("buildAttendanceReport", () => {
  it("renders headers with checked/total and suffixes per check state", () => {
    const text = buildAttendanceReport(departments, new Set(["u1", "u2"]));
    expect(text).toBe(
      [
        "Logistics (2 of 3)",
        "Alice Tan",
        "Bob Ng",
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

  it("marks a checked user bare (present wins, no event tags or absent)", () => {
    const text = buildAttendanceReport(departments, new Set(["u2", "u3"]));
    expect(text).toBe(
      [
        "Logistics (2 of 3)",
        "Alice Tan - Absent",
        "Bob Ng",
        "Carol Lim",
        "",
        "Operations (0 of 1)",
        "David Koh - Absent",
      ].join("\n"),
    );
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
