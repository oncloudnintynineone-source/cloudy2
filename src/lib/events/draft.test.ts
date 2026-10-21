import { describe, expect, it } from "vitest";

import { eventDraftPresentation } from "./draft";

describe("eventDraftPresentation", () => {
  it("labels a new-event draft without a title", () => {
    expect(eventDraftPresentation("create")).toEqual({
      heading: "Resume draft",
      detail: "New event",
      ariaLabel: "Resume draft (new event)",
    });
  });

  it("uses the event title for an edit draft", () => {
    expect(eventDraftPresentation("edit", "  Morning briefing ")).toEqual({
      heading: "Resume draft",
      detail: "Morning briefing",
      ariaLabel: "Resume draft (edit event for Morning briefing)",
    });
  });

  it("falls back to a neutral detail for a blank title", () => {
    expect(eventDraftPresentation("duplicate", "   ")).toEqual({
      heading: "Resume draft",
      detail: "Duplicate event",
      ariaLabel: "Resume draft (duplicate event)",
    });
  });

  it("marks duplicate drafts as copies of the source event", () => {
    expect(eventDraftPresentation("duplicate", "Morning briefing")).toEqual({
      heading: "Resume draft",
      detail: "Copy of Morning briefing",
      ariaLabel: "Resume draft (duplicate of Morning briefing)",
    });
  });

  it("never uses a title line for a new-event draft", () => {
    expect(eventDraftPresentation("create", "Leftover title")).toEqual({
      heading: "Resume draft",
      detail: "New event",
      ariaLabel: "Resume draft (new event)",
    });
  });

  it("keeps the visible label as a prefix of the accessible name", () => {
    for (const kind of ["create", "edit", "duplicate"] as const) {
      expect(eventDraftPresentation(kind, "Test").ariaLabel).toMatch(/^Resume draft/);
    }
  });
});
