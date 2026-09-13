import { describe, expect, it } from "vitest";

import {
  buildParadeStateEmail,
  PARADE_EMAIL_SAMPLE_CONTEXT,
  type ParadeEmailEvent,
  type ParadeEmailSection,
} from "./report";

const outEvent: ParadeEmailEvent = {
  title: "Overseas course",
  eventType: "Course",
  location: "SITE",
  start: "2026-09-13 08:00:00",
  end: "2026-09-13 18:00:00",
  allDay: false,
};

const sections: ParadeEmailSection[] = [
  {
    name: "HQ",
    users: [
      { id: "u1", name: "Alice", departmentName: "HQ" },
      { id: "u2", name: "Bob", departmentName: "HQ" },
    ],
    children: [
      {
        name: "Ops",
        users: [{ id: "u3", name: "Cara", departmentName: "Ops" }],
        children: [],
      },
    ],
  },
];

describe("buildParadeStateEmail", () => {
  it("counts present/total/out-of-camp across the whole tree", () => {
    const report = buildParadeStateEmail({
      date: "2026-09-13",
      nameTemplate: "{name}",
      sections,
      eventsByUser: new Map([["u2", [outEvent]]]),
      now: new Date("2026-09-12T23:00:00Z"),
    });
    expect(report.total).toBe(3);
    expect(report.present).toBe(2);
    expect(report.outOfCamp).toBe(1);
  });

  it("renders per-person status and subtree counts", () => {
    const report = buildParadeStateEmail({
      date: "2026-09-13",
      nameTemplate: "{name}",
      sections,
      eventsByUser: new Map([["u2", [outEvent]]]),
    });
    expect(report.body).toContain("HQ (2 of 3 present)");
    expect(report.body).toContain("Alice — Present");
    expect(report.body).toContain("Bob — Out of camp: Course (SITE, 8:00 AM – 6:00 PM)");
    expect(report.body).toContain("Ops (1 of 1 present)");
    expect(report.body).toContain("Cara — Present");
  });

  it("substitutes tokens in the subject and body templates", () => {
    const report = buildParadeStateEmail({
      date: "2026-09-13",
      nameTemplate: "{name}",
      sections,
      eventsByUser: new Map([["u2", [outEvent]]]),
      subjectTemplate: "Parade {date} — {present}/{total}",
      bodyTemplate: "{departments}",
      now: new Date("2026-09-12T23:00:00Z"),
    });
    expect(report.subject).toBe("Parade 2026-09-13 — 2/3");
    expect(report.body.startsWith("HQ (2 of 3 present)")).toBe(true);
  });

  it("applies the name template", () => {
    const report = buildParadeStateEmail({
      date: "2026-09-13",
      nameTemplate: "{name} ({department})",
      sections,
      eventsByUser: new Map(),
    });
    expect(report.body).toContain("Alice (HQ) — Present");
    expect(report.body).toContain("Cara (Ops) — Present");
  });

  it("falls back to defaults for blank templates", () => {
    const report = buildParadeStateEmail({
      date: "2026-09-13",
      nameTemplate: "{name}",
      sections,
      eventsByUser: new Map(),
      subjectTemplate: "   ",
      bodyTemplate: "",
    });
    expect(report.subject).toContain("2026-09-13");
    expect(report.body).toContain("Parade State for 2026-09-13");
  });

  it("skips departments whose subtree has no users", () => {
    const report = buildParadeStateEmail({
      date: "2026-09-13",
      nameTemplate: "{name}",
      sections: [
        { name: "Empty", users: [], children: [] },
        { name: "HQ", users: [{ id: "u1", name: "Alice", departmentName: "HQ" }], children: [] },
      ],
      eventsByUser: new Map(),
    });
    expect(report.body).not.toContain("Empty");
    expect(report.body).toContain("HQ (1 of 1 present)");
  });

  it("keeps the sample preview context loadable", () => {
    expect(PARADE_EMAIL_SAMPLE_CONTEXT.departments).toContain("HQ (2 of 3 present)");
  });
});
