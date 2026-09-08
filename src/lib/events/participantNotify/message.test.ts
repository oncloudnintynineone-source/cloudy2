import { describe, expect, it } from "vitest";

import { buildParticipantNotification, type ParticipantNotifyReason } from "./message";
import type { ParticipantNotifyTemplates } from "./templates";

type MessageInput = Omit<Parameters<typeof buildParticipantNotification>[0], "reason">;

const base: MessageInput = {
  title: "Company drill",
  eventType: "drill",
  time: "2026-08-21 14:00 – 15:30",
  location: "Parade Square",
};

function render(
  reason: ParticipantNotifyReason,
  overrides: Partial<MessageInput> = {},
): ReturnType<typeof buildParticipantNotification> {
  return buildParticipantNotification({ reason, ...base, ...overrides });
}

describe("buildParticipantNotification (default templates)", () => {
  it("builds a created notification with event title + time + location", () => {
    expect(render("created")).toEqual({
      title: "Company drill",
      body: "You're included in a new event · 2026-08-21 14:00 – 15:30 · Parade Square",
    });
  });

  it("uses the added phrasing for updates", () => {
    expect(render("added")).toEqual({
      title: "Company drill",
      body: "You've been added to this event · 2026-08-21 14:00 – 15:30 · Parade Square",
    });
  });

  it("omits the location when absent via its conditional group", () => {
    const { body } = render("added", { location: "  " });
    expect(body).toBe("You've been added to this event · 2026-08-21 14:00 – 15:30");
  });

  it("omits a blank time as well", () => {
    const { body } = render("created", { location: null, time: "" });
    expect(body).toBe("You're included in a new event");
  });

  it("falls back to the event type as the headline for blank titles", () => {
    expect(render("created", { title: "   " }).title).toBe("drill");
  });

  it("falls back to a generic headline when title and type are both blank", () => {
    expect(render("created", { title: "", eventType: "" }).title).toBe("New event");
    expect(render("added", { title: "", eventType: "" }).title).toBe("Event update");
  });
});

describe("buildParticipantNotification (custom templates)", () => {
  const custom: ParticipantNotifyTemplates = {
    createdTitle: "{type}: {title}",
    createdBody: "{title} @ {location}< ({time})>",
    addedTitle: "Re: {title}",
    addedBody: "{title}< · {time}> — see details",
  };

  it("renders the custom title/body templates for each reason", () => {
    expect(
      buildParticipantNotification({ reason: "created", ...base, templates: custom }),
    ).toEqual({
      title: "drill: Company drill",
      body: "Company drill @ Parade Square (2026-08-21 14:00 – 15:30)",
    });
    expect(buildParticipantNotification({ reason: "added", ...base, templates: custom })).toEqual({
      title: "Re: Company drill",
      body: "Company drill · 2026-08-21 14:00 – 15:30 — see details",
    });
  });

  it("drops a conditional group whose token is empty", () => {
    const { body } = buildParticipantNotification({
      reason: "created",
      ...base,
      time: "",
      location: null,
      templates: custom,
    });
    expect(body).toBe("Company drill @");
    expect(buildParticipantNotification({
      reason: "created",
      ...base,
      time: "",
      location: "Hall A",
      templates: custom,
    }).body).toBe("Company drill @ Hall A");
  });

  it("keeps unknown tokens as literal text (and counts as content)", () => {
    const { title } = buildParticipantNotification({
      reason: "created",
      ...base,
      templates: { ...custom, createdTitle: "See {summary}" },
    });
    expect(title).toBe("See {summary}");
  });

  it("applies the reason headline fallback when a custom title template renders empty", () => {
    expect(
      buildParticipantNotification({
        reason: "created",
        ...base,
        title: "",
        eventType: "",
        templates: { ...custom, createdTitle: "{title} <({type})>" },
      }).title,
    ).toBe("New event");
  });

  it("falls back to built-in defaults for blank template fields", () => {
    const partial = {
      createdBody: "   ",
      addedTitle: "",
      addedBody: "Tap to open",
      createdTitle: "",
    } as ParticipantNotifyTemplates;
    const created = buildParticipantNotification({ reason: "created", ...base, templates: partial });
    // createdTitle blank -> default "{title}".
    expect(created.title).toBe("Company drill");
    expect(created.body).toBe("You're included in a new event · 2026-08-21 14:00 – 15:30 · Parade Square");
    const added = buildParticipantNotification({ reason: "added", ...base, templates: partial });
    expect(added.title).toBe("Company drill"); // addedTitle blank -> default "{title}"
    expect(added.body).toBe("Tap to open");
  });
});
