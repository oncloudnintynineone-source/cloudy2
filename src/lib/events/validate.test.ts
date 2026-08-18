import { describe, expect, it } from "vitest";

import { validateEventForm, withCreatorInvited, type EventFormValues } from "./validate";

const base: EventFormValues = {
  title: "Team sync",
  timeOption: "range",
  startAmPm: "",
  endAmPm: "",
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

  it("allows an empty description (title comes from the template)", () => {
    expect(validateEventForm({ ...base, title: "" })).toEqual({});
    expect(validateEventForm({ ...base, title: "  " })).toEqual({});
  });

  it("requires a creator when requireCreator is set", () => {
    expect(validateEventForm({ ...base, creatorId: "" }, { requireCreator: true }).creatorId).toBe(
      "Choose who this event is on behalf of",
    );
    expect(validateEventForm(base, { requireCreator: true })).toEqual({});
  });

  it("does not require a creator by default", () => {
    expect(validateEventForm({ ...base, creatorId: "" })).toEqual({});
  });

  it("requires start and end", () => {
    expect(validateEventForm({ ...base, start: "" }).start).toBe("Start is required");
    expect(validateEventForm({ ...base, end: "" }).end).toBe("End is required");
  });

  it("rejects an end before the start", () => {
    expect(
      validateEventForm({ ...base, start: "2026-08-15 10:00:00", end: "2026-08-15 09:00:00" }).end,
    ).toBe("End must be on or after start");
  });

  it("accepts a valid full-day event with indicators", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "full",
        startAmPm: "AM",
        endAmPm: "PM",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }),
    ).toEqual({});
  });

  it("requires both AM/PM indicators for full-day events", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "full",
        startAmPm: "",
        endAmPm: "PM",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }).startAmPm,
    ).toBe("Select AM or PM");
    expect(
      validateEventForm({
        ...base,
        timeOption: "full",
        startAmPm: "AM",
        endAmPm: "",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }).endAmPm,
    ).toBe("Select AM or PM");
  });

  it("accepts a same-day AM-to-PM full-day span", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "full",
        startAmPm: "AM",
        endAmPm: "PM",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }),
    ).toEqual({});
  });

  it("rejects a same-day PM-to-AM full-day span", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "full",
        startAmPm: "PM",
        endAmPm: "AM",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }).end,
    ).toBe("End must be on or after start");
  });

  it("accepts a multi-day span regardless of indicators", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "full",
        startAmPm: "PM",
        endAmPm: "AM",
        start: "2026-08-14 00:00:00",
        end: "2026-08-15 00:00:00",
      }),
    ).toEqual({});
  });
});

describe("withCreatorInvited", () => {
  it("adds the creator as an invitee", () => {
    expect(withCreatorInvited(base).inviteeUserIds).toEqual(["user-1"]);
  });

  it("dedupes the creator already in the invitee list", () => {
    expect(
      withCreatorInvited({ ...base, inviteeUserIds: ["user-1", "user-2"] }).inviteeUserIds,
    ).toEqual(["user-1", "user-2"]);
  });

  it("leaves other invitees in form order", () => {
    expect(
      withCreatorInvited({ ...base, inviteeUserIds: ["user-2", "user-3"] }).inviteeUserIds,
    ).toEqual(["user-1", "user-2", "user-3"]);
  });

  it("no-ops when there is no creator", () => {
    const input = { ...base, creatorId: "" };
    expect(withCreatorInvited(input)).toEqual(input);
  });

  it("preserves the remaining form fields", () => {
    expect(withCreatorInvited(base)).toEqual({
      ...base,
      inviteeUserIds: ["user-1"],
    });
  });
});
