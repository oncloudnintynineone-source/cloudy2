import { describe, expect, it } from "vitest";

import { encodeEventNotes, encodeNotesBlock, withEditLink } from "@/lib/events/notes";

import { collectCreatorIds } from "./eventsCacheCreators";
import type { GcalEventItem } from "./types";

const CREATOR_A = "123e4567-e89b-4d1a-a2b3-456789abcd02";
const CREATOR_B = "123e4567-e89b-4d1a-a2b3-456789abcd03";

/** A real notes description for one event, as written to Google. */
function description(creatorId: string | undefined, extra: Record<string, unknown> = {}): string {
  const json = encodeEventNotes({ createdBy: creatorId, ...extra });
  if (!json) {
    return "";
  }
  return withEditLink(encodeNotesBlock(json), "https://calendar.google.com/calendar/u/0/r/eventedit/x");
}

function event(id: string, text: string): GcalEventItem {
  return {
    id,
    calendarId: "dept@group.calendar.google.com",
    title: id,
    description: text,
    allDay: false,
    location: "",
    start: new Date("2026-08-01T01:00:00.000Z"),
    end: new Date("2026-08-01T02:00:00.000Z"),
    recurringEventId: null,
    originalStartTime: null,
    recurrence: null,
    status: null,
  };
}

describe("collectCreatorIds", () => {
  it("returns the distinct organizers of one cached month", () => {
    const ids = collectCreatorIds([
      event("a", description(CREATOR_A)),
      event("b", description(CREATOR_B)),
      event("c", description(CREATOR_A)),
    ]);
    expect(ids).toEqual([CREATOR_A, CREATOR_B]);
  });

  it("ignores external events with no notes block and blank organizers", () => {
    expect(collectCreatorIds([event("ext", ""), event("blank", description(undefined))])).toEqual(
      [],
    );
  });

  it("drops creator ids that are not UUIDs (legacy or pseudo-accounts)", () => {
    const ids = collectCreatorIds([event("admin", description("admin")), event("a", description(CREATOR_A))]);
    expect(ids).toEqual([CREATOR_A]);
  });

  it("returns an empty list for an empty month", () => {
    expect(collectCreatorIds([])).toEqual([]);
  });
});
