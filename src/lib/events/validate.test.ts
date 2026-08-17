import { describe, expect, it } from "vitest";

import { validateEventForm, type EventFormValues } from "./validate";

const base: EventFormValues = {
  title: "Team sync",
  timeOption: "range",
  amPm: "",
  start: "2026-08-15 09:00:00",
  end: "2026-08-15 10:00:00",
  eventType: "Meeting",
  creatorId: "user-1",
  inviteeUserIds: [],
  inviteeDepartments: [],
};

describe("validateEventForm", () => {
  it("accepts a complete valid form", () => {
    expect(validateEventForm(base)).toEqual({});
  });

  it("requires a description", () => {
    expect(validateEventForm({ ...base, title: "  " }).title).toBe("Description is required");
  });

  it("requires start and end", () => {
    expect(validateEventForm({ ...base, start: "" }).start).toBe("Start is required");
    expect(validateEventForm({ ...base, end: "" }).end).toBe("End is required");
  });

  it("rejects an end before the start", () => {
    expect(
      validateEventForm({ ...base, start: "2026-08-15 10:00:00", end: "2026-08-15 09:00:00" })
        .end,
    ).toBe("End must be on or after start");
  });

  it("requires AM/PM for ampm events", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "ampm",
        amPm: "",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }).amPm,
    ).toBe("Select AM or PM");
  });

  it("accepts an ampm event with the indicator set", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "ampm",
        amPm: "PM",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }),
    ).toEqual({});
  });

  it("allows a same-day full-day event", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "full",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }),
    ).toEqual({});
  });
});
