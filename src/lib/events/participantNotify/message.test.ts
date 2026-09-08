import { describe, expect, it } from "vitest";

import { buildParticipantNotification, type ParticipantNotifyReason } from "./message";

type MessageInput = Omit<Parameters<typeof buildParticipantNotification>[0], "reason">;

const timeParts: MessageInput["timeParts"] = {
  timeOption: "range",
  start: "2026-08-21 14:00:00",
  end: "2026-08-21 15:30:00",
  startAmPm: "",
  endAmPm: "",
};

const base: MessageInput = {
  title: "Company drill",
  eventType: "drill",
  timeParts,
  location: "Parade Square",
};

function render(
  reason: ParticipantNotifyReason,
  overrides: Partial<MessageInput> = {},
): ReturnType<typeof buildParticipantNotification> {
  return buildParticipantNotification({ reason, ...base, ...overrides });
}

describe("buildParticipantNotification", () => {
  it("builds a created notification with event title + time + location", () => {
    expect(render("created")).toEqual({
      title: "Company drill",
      body: "You're included in a new event · 2026-08-21 14:00 – 15:30 · Parade Square",
    });
  });

  it("uses the added phrasing for updates", () => {
    expect(render("added").body).toMatch(/^You've been added to this event · /);
  });

  it("omits the location when absent", () => {
    const { body } = render("added", { location: "  " });
    expect(body).toBe("You've been added to this event · 2026-08-21 14:00 – 15:30");
  });

  it("falls back to the event type as the headline for blank titles", () => {
    expect(render("created", { title: "   " }).title).toBe("drill");
  });

  it("falls back to a generic headline when title and type are both blank", () => {
    expect(render("created", { title: "", eventType: "" }).title).toBe("New event");
    expect(render("added", { title: "", eventType: "" }).title).toBe("Event update");
  });

  it("renders day-based events with their AM/PM marker", () => {
    const { body } = render("created", {
      title: "",
      eventType: "",
      location: null,
      timeParts: {
        timeOption: "full",
        start: "2026-08-21 00:00:00",
        end: "2026-08-21 00:00:00",
        startAmPm: "AM",
        endAmPm: "PM",
      },
    });
    expect(body).toContain("2026-08-21 (AM–PM)");
  });
});
