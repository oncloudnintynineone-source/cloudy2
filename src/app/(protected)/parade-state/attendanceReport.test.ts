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

describe("buildAttendanceReport with hierarchy", () => {
  const nested: AttendanceReportDepartment[] = [
    {
      name: "HQ",
      users: [{ id: "u0", name: "John Doe" }],
      children: [
        {
          name: "Logistics",
          users: [
            { id: "u1", name: "Alice Tan" },
            { id: "u2", name: "Bob Ng" },
          ],
        },
        {
          name: "Operations",
          users: [{ id: "u4", name: "David Koh" }],
          children: [{ name: "Night shift", users: [{ id: "u5", name: "Eve Wong" }] }],
        },
      ],
    },
    { name: "Field", users: [{ id: "u6", name: "Frank Goh" }] },
  ];

  it("renders flat blocks in tree order with aggregated parent counts", () => {
    const text = buildAttendanceReport(nested, new Set(["u0", "u1"]));
    expect(text).toBe(
      [
        "HQ (2 of 5)",
        "John Doe",
        "",
        "Logistics (1 of 2)",
        "Alice Tan",
        "Bob Ng - Absent",
        "",
        "Operations (0 of 2)",
        "David Koh - Absent",
        "",
        "Night shift (0 of 1)",
        "Eve Wong - Absent",
        "",
        "Field (0 of 1)",
        "Frank Goh - Absent",
      ].join("\n"),
    );
  });

  it("counts transitive descendants in the topmost header", () => {
    const text = buildAttendanceReport(nested, new Set(["u1", "u4", "u5"]));
    expect(text).toContain("HQ (3 of 5)");
    expect(text).toContain("Operations (2 of 2)");
  });

  it("omits the block of a parent without direct users but keeps its children", () => {
    const groupless: AttendanceReportDepartment[] = [
      {
        name: "Group",
        users: [],
        children: [nested[0]],
      },
    ];
    const text = buildAttendanceReport(groupless, new Set());
    expect(text).toContain("HQ (0 of 5)");
    expect(text).not.toContain("Group");
    expect(text.startsWith("HQ (0 of 5)")).toBe(true);
  });
});
