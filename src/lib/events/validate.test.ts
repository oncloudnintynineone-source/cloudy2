import { describe, expect, it } from "vitest";

import {
  resolveEventAuthor,
  validateEventForm,
  type EventFormValues,
} from "./validate";

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
  ownerOnlyEdits: false,
  outOfCamp: false,
  overseas: false,
  pinned: false,
  location: "Hall A",
};

describe("validateEventForm", () => {
  it("accepts a complete valid form", () => {
    expect(validateEventForm(base)).toEqual({});
  });

  it("allows an empty description (title comes from the template)", () => {
    expect(validateEventForm({ ...base, title: "" })).toEqual({});
    expect(validateEventForm({ ...base, title: "  " })).toEqual({});
  });

  it("does not require a creator (blank means the acting user, defaulted elsewhere)", () => {
    expect(validateEventForm({ ...base, creatorId: "" })).toEqual({});
    expect(validateEventForm({ ...base, creatorId: "  " })).toEqual({});
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

  it("requires a time part on both sides for Start & End events", () => {
    // A cleared time picker stores a bare date (no HH:mm part).
    expect(validateEventForm({ ...base, start: "2026-08-15" }).start).toBe(
      "Start time is required",
    );
    expect(validateEventForm({ ...base, end: "2026-08-15" }).end).toBe(
      "End time is required",
    );
    expect(
      validateEventForm({ ...base, start: "2026-08-15", end: "2026-08-15" }),
    ).toEqual({
      start: "Start time is required",
      end: "End time is required",
    });
  });

  it("does not require a time part for day-based options", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "full",
        start: "2026-08-15",
        end: "2026-08-15",
      }),
    ).toEqual({});
    expect(
      validateEventForm({
        ...base,
        timeOption: "half",
        startAmPm: "AM",
        endAmPm: "PM",
        start: "2026-08-15",
        end: "2026-08-15",
      }),
    ).toEqual({});
  });

  it("accepts a valid full-day event without indicators", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "full",
        startAmPm: "",
        endAmPm: "",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }),
    ).toEqual({});
  });

  it("accepts a valid half-day event with indicators", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "half",
        startAmPm: "AM",
        endAmPm: "PM",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }),
    ).toEqual({});
  });

  it("requires both AM/PM indicators for half-day events only", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "half",
        startAmPm: "",
        endAmPm: "PM",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }).startAmPm,
    ).toBe("Select AM or PM");
    expect(
      validateEventForm({
        ...base,
        timeOption: "half",
        startAmPm: "AM",
        endAmPm: "",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }).endAmPm,
    ).toBe("Select AM or PM");
    // Full-day events no longer carry indicators at all.
    expect(
      validateEventForm({
        ...base,
        timeOption: "full",
        startAmPm: "",
        endAmPm: "",
        start: "2026-08-15 00:00:00",
        end: "2026-08-16 00:00:00",
      }),
    ).toEqual({});
  });

  it("accepts a same-day AM-to-PM half-day span", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "half",
        startAmPm: "AM",
        endAmPm: "PM",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }),
    ).toEqual({});
  });

  it("rejects a same-day PM-to-AM half-day span", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "half",
        startAmPm: "PM",
        endAmPm: "AM",
        start: "2026-08-15 00:00:00",
        end: "2026-08-15 00:00:00",
      }).end,
    ).toBe("End must be on or after start");
  });

  it("folds the indicator into the sort key for multi-day spans", () => {
    expect(
      validateEventForm({
        ...base,
        timeOption: "half",
        startAmPm: "PM",
        endAmPm: "AM",
        start: "2026-08-14 00:00:00",
        end: "2026-08-15 00:00:00",
      }),
    ).toEqual({});
  });
});

describe("resolveEventAuthor", () => {
  const ref = { creatorId: "user-1", ownerOnlyEdits: false };

  it("records the acting session user on create (no ref) and never merges them into invitees", () => {
    const result = resolveEventAuthor(base, "actor-1", null, true);
    expect(result.creatorId).toBe("actor-1");
    expect(result.inviteeUserIds).toEqual([]);
  });

  it("takes the submitted owner-only lock on create", () => {
    expect(
      resolveEventAuthor({ ...base, creatorId: "ignored", ownerOnlyEdits: true }, "actor-1", null, true)
        .ownerOnlyEdits,
    ).toBe(true);
  });

  it("keeps the stored organizer on edit, ignoring any submitted creator", () => {
    const result = resolveEventAuthor(
      { ...base, creatorId: "someone-else", ownerOnlyEdits: false },
      "actor-1",
      ref,
      false,
    );
    expect(result.creatorId).toBe("user-1");
  });

  it("adopts the acting user on a creator-less (legacy/external) first edit", () => {
    const result = resolveEventAuthor(
      { ...base, creatorId: "" },
      "actor-1",
      { creatorId: null, ownerOnlyEdits: false },
      true,
    );
    expect(result.creatorId).toBe("actor-1");
  });

  it("lets the organizer (or admin) change the lock, but keeps it for other editors", () => {
    expect(
      resolveEventAuthor({ ...base, ownerOnlyEdits: true }, "actor-1", ref, true).ownerOnlyEdits,
    ).toBe(true);
    // A non-organizer editing keeps the stored lock value.
    expect(
      resolveEventAuthor({ ...base, ownerOnlyEdits: true }, "actor-1", ref, false).ownerOnlyEdits,
    ).toBe(false);
    expect(
      resolveEventAuthor({ ...base, ownerOnlyEdits: false }, "actor-1", { ...ref, ownerOnlyEdits: true }, false)
        .ownerOnlyEdits,
    ).toBe(true);
  });

  it("preserves the remaining form fields", () => {
    expect(resolveEventAuthor(base, "actor-1", null, true)).toEqual({
      ...base,
      creatorId: "actor-1",
    });
  });
});
