import { describe, expect, it } from "vitest";

import {
  GUIDE_SECTIONS,
  guideSectionIdForPath,
  orderGuideSections,
} from "./guideContent";

describe("guideSectionIdForPath", () => {
  it("matches a route exactly", () => {
    expect(guideSectionIdForPath(GUIDE_SECTIONS, "/dashboard")).toBe("dashboard");
    expect(guideSectionIdForPath(GUIDE_SECTIONS, "/my-events")).toBe("my-events");
  });

  it("matches nested routes by longest prefix", () => {
    expect(guideSectionIdForPath(GUIDE_SECTIONS, "/settings/users")).toBe("settings");
    expect(guideSectionIdForPath(GUIDE_SECTIONS, "/parade-state/deep")).toBe("parade-state");
  });

  it("does not match a sibling that merely shares the prefix string", () => {
    // "/dashboard-x" is not under "/dashboard".
    expect(guideSectionIdForPath(GUIDE_SECTIONS, "/dashboard-x")).toBe("getting-started");
  });

  it("falls back to the general block", () => {
    expect(guideSectionIdForPath(GUIDE_SECTIONS, "/")).toBe("getting-started");
    expect(guideSectionIdForPath(GUIDE_SECTIONS, "/somewhere-else")).toBe("getting-started");
  });
});

describe("orderGuideSections", () => {
  it("puts the current page first, then the general block, then authored order", () => {
    const ordered = orderGuideSections(GUIDE_SECTIONS, "contacts").map((s) => s.id);
    expect(ordered[0]).toBe("contacts");
    expect(ordered[1]).toBe("getting-started");
    // The rest keep their authored relative order.
    const authored = GUIDE_SECTIONS.map((s) => s.id).filter(
      (id) => id !== "contacts" && id !== "getting-started",
    );
    expect(ordered.slice(2)).toEqual(authored);
  });

  it("is stable for the general block itself", () => {
    const ordered = orderGuideSections(GUIDE_SECTIONS, "getting-started").map((s) => s.id);
    expect(ordered[0]).toBe("getting-started");
  });
});

describe("GUIDE_SECTIONS content", () => {
  it("has unique ids and routes, exactly one general block, and non-empty copy", () => {
    const ids = new Set(GUIDE_SECTIONS.map((s) => s.id));
    expect(ids.size).toBe(GUIDE_SECTIONS.length);
    const routes = GUIDE_SECTIONS.map((s) => s.route).filter((r) => r !== null);
    expect(new Set(routes).size).toBe(routes.length);
    expect(GUIDE_SECTIONS.filter((s) => s.route === null)).toHaveLength(1);
    for (const section of GUIDE_SECTIONS) {
      expect(section.summary.length).toBeGreaterThan(0);
      expect(section.points.length).toBeGreaterThan(0);
      for (const point of section.points) {
        expect(point.length).toBeGreaterThan(0);
      }
    }
  });
});
