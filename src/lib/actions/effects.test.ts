import { describe, expect, it } from "vitest";

import { resolveWriteEffect, WRITE_EFFECTS } from "./effects";

describe("WRITE_EFFECTS", () => {
  it("keeps the roster create/update effect (users + departments)", () => {
    expect(WRITE_EFFECTS.users).toEqual({
      cache: ["users"],
      revalidate: ["/settings/users", "/settings/departments"],
    });
  });

  it("keeps the department effect (names are embedded in user rows)", () => {
    expect(WRITE_EFFECTS.departments).toEqual({
      cache: ["calendars", "users"],
      revalidate: ["/settings/departments", "/settings/users", "/dashboard", "/parade-state"],
    });
  });

  it("keeps the department order effect narrower than a rename", () => {
    expect(WRITE_EFFECTS.departmentOrder).toEqual({
      cache: ["calendars"],
      revalidate: ["/settings/departments", "/dashboard", "/parade-state"],
    });
  });

  it("keeps the dashboard/parade paths for template edits", () => {
    expect(WRITE_EFFECTS.templates).toEqual({
      cache: ["eventTitleTemplates"],
      revalidate: ["/settings/templates", "/dashboard", "/parade-state"],
    });
  });

  it("keeps every settings-tab path", () => {
    expect(WRITE_EFFECTS.eventTypes.revalidate).toEqual(["/settings/event-types"]);
    expect(WRITE_EFFECTS.eventTypeGroups.cache).toEqual(["eventTypeGroups"]);
    expect(WRITE_EFFECTS.quickLinks).toEqual({
      cache: ["quickLinks"],
      revalidate: ["/settings/quick-links", "/dashboard"],
    });
    expect(WRITE_EFFECTS.webhooks).toEqual({
      cache: [],
      revalidate: ["/settings/webhooks"],
    });
    expect(WRITE_EFFECTS.kahGroups).toEqual({
      cache: [],
      revalidate: ["/settings/kah-groups"],
    });
  });
});

describe("resolveWriteEffect", () => {
  it("returns the preset untouched without an extra", () => {
    expect(resolveWriteEffect("webhooks")).toEqual(WRITE_EFFECTS.webhooks);
  });

  it("appends one-off cache keys and paths, preserving order", () => {
    expect(
      resolveWriteEffect("eventTypeGroups", {
        cache: ["eventTypes"],
        revalidate: ["/dashboard"],
      }),
    ).toEqual({
      cache: ["eventTypeGroups", "eventTypes"],
      revalidate: ["/settings/event-types", "/dashboard"],
    });
  });

  it("dedupes values already in the preset", () => {
    expect(
      resolveWriteEffect("users", {
        cache: ["users"],
        revalidate: ["/settings/users"],
      }),
    ).toEqual(WRITE_EFFECTS.users);
  });
});
