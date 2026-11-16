import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@/lib/events/queries";

import {
  buildWidgetFlat,
  clampWidgetDays,
  eventEndDateInclusive,
  eventInWindow,
  eventTimeLabel,
  eventWhenLabel,
  relativeDayLabel,
  shapeWidgetAgenda,
  shapeWidgetPinned,
  type WidgetAgendaEvent,
} from "./shape";

const TODAY = "2026-11-16";
const LAST_DAY = "2026-11-22";

function makeEvent(overrides: {
  start: string;
  end: string;
  title?: string;
  allDay?: boolean;
  timeOption?: "range" | "full" | "half";
  startAmPm?: "AM" | "PM" | null;
  endAmPm?: "AM" | "PM" | null;
  eventId?: string | null;
  calendarId?: string;
  calendarName?: string;
  location?: string;
  pinned?: boolean;
  pinnedDepartments?: string[];
}): CalendarEvent {
  const allDay = overrides.allDay ?? false;
  const title = overrides.title ?? "Event";
  return {
    id: `copy-${title}`,
    title,
    start: overrides.start,
    end: overrides.end,
    color: "blue",
    payload: {
      calendarId: overrides.calendarId ?? "cal-1",
      googleEventId: `g-${title}`,
      allDay,
      eventType: null,
      calendarName: overrides.calendarName ?? "Ops",
      eventId: overrides.eventId ?? "evt-1",
      creatorId: null,
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
      ownerOnlyEdits: false,
      registrationEnabled: false,
      registrationCap: null,
      rawTitle: title,
      timeOption: overrides.timeOption ?? (allDay ? "full" : "range"),
      startAmPm: overrides.startAmPm ?? null,
      endAmPm: overrides.endAmPm ?? null,
      outOfCamp: false,
      overseas: false,
      pinned: overrides.pinned ?? false,
      pinnedDepartments: overrides.pinnedDepartments,
      location: overrides.location ?? "",
      external: false,
    },
  };
}

const timedToday = makeEvent({
  start: "2026-11-16 09:00:00",
  end: "2026-11-16 10:00:00",
  title: "Briefing",
  location: "Room 1",
});

describe("clampWidgetDays", () => {
  it("defaults and clamps into 1–14", () => {
    expect(clampWidgetDays(null)).toBe(7);
    expect(clampWidgetDays("")).toBe(7);
    expect(clampWidgetDays("nope")).toBe(7);
    expect(clampWidgetDays("0")).toBe(1);
    expect(clampWidgetDays("-4")).toBe(1);
    expect(clampWidgetDays("3")).toBe(3);
    expect(clampWidgetDays("99")).toBe(14);
    expect(clampWidgetDays(2.9)).toBe(2);
  });
});

describe("relativeDayLabel", () => {
  it("uses Today / Tomorrow / Yesterday", () => {
    expect(relativeDayLabel("2026-11-16", TODAY)).toBe("Today");
    expect(relativeDayLabel("2026-11-17", TODAY)).toBe("Tomorrow");
    expect(relativeDayLabel("2026-11-15", TODAY)).toBe("Yesterday");
  });

  it("formats a later day with its weekday, adding the year when needed", () => {
    expect(relativeDayLabel("2026-11-21", TODAY)).toBe("Sat 21 Nov");
    expect(relativeDayLabel("2027-01-02", TODAY)).toBe("Sat 2 Jan 2027");
  });
});

describe("eventEndDateInclusive", () => {
  it("steps back the exclusive all-day end", () => {
    const event = makeEvent({
      start: "2026-11-16 00:00:00",
      end: "2026-11-18 00:00:00",
      allDay: true,
    });
    expect(eventEndDateInclusive(event)).toBe("2026-11-17");
  });

  it("steps back a timed event ending exactly at midnight", () => {
    const event = makeEvent({
      start: "2026-11-15 22:00:00",
      end: "2026-11-16 00:00:00",
    });
    expect(eventEndDateInclusive(event)).toBe("2026-11-15");
  });

  it("keeps the same day for a normal timed event", () => {
    expect(eventEndDateInclusive(timedToday)).toBe("2026-11-16");
  });
});

describe("eventInWindow", () => {
  it("keeps events inside [today, lastDay]", () => {
    expect(eventInWindow(timedToday, TODAY, LAST_DAY)).toBe(true);
    expect(
      eventInWindow(
        makeEvent({ start: "2026-11-22 09:00:00", end: "2026-11-22 10:00:00" }),
        TODAY,
        LAST_DAY,
      ),
    ).toBe(true);
  });

  it("drops events that ended before today or start after the window", () => {
    expect(
      eventInWindow(
        makeEvent({
          start: "2026-11-15 00:00:00",
          end: "2026-11-16 00:00:00",
          allDay: true,
        }),
        TODAY,
        LAST_DAY,
      ),
    ).toBe(false);
    expect(
      eventInWindow(
        makeEvent({ start: "2026-11-15 22:00:00", end: "2026-11-16 00:00:00" }),
        TODAY,
        LAST_DAY,
      ),
    ).toBe(false);
    expect(
      eventInWindow(
        makeEvent({ start: "2026-11-23 09:00:00", end: "2026-11-23 10:00:00" }),
        TODAY,
        LAST_DAY,
      ),
    ).toBe(false);
  });

  it("keeps an ongoing multi-day event", () => {
    const ongoing = makeEvent({
      start: "2026-11-15 22:00:00",
      end: "2026-11-17 02:00:00",
    });
    expect(eventInWindow(ongoing, TODAY, LAST_DAY)).toBe(true);
    expect(eventWhenLabel(ongoing, TODAY)).toBe("Ongoing until Tomorrow");
  });
});

describe("eventTimeLabel / eventWhenLabel", () => {
  it("renders timed, all-day and half-day shapes", () => {
    expect(eventTimeLabel(timedToday)).toBe("09:00–10:00");
    expect(eventWhenLabel(timedToday, TODAY)).toBe("Today 09:00–10:00");

    const allDay = makeEvent({
      start: "2026-11-16 00:00:00",
      end: "2026-11-17 00:00:00",
      allDay: true,
    });
    expect(eventTimeLabel(allDay)).toBe("All day");
    expect(eventWhenLabel(allDay, TODAY)).toBe("Today (all day)");

    const half = makeEvent({
      start: "2026-11-16 00:00:00",
      end: "2026-11-17 00:00:00",
      allDay: true,
      timeOption: "half",
      startAmPm: "AM",
      endAmPm: "PM",
    });
    expect(eventTimeLabel(half)).toBe("AM–PM");
    expect(eventWhenLabel(half, TODAY)).toBe("Today (AM–PM)");
  });

  it("renders a multi-day span without the time", () => {
    const multi = makeEvent({
      start: "2026-11-17 09:00:00",
      end: "2026-11-19 17:00:00",
    });
    expect(eventWhenLabel(multi, TODAY)).toBe("Tomorrow – Thu 19 Nov");
  });
});

describe("shapeWidgetAgenda", () => {
  it("orders, filters to the window, and exposes next/counts", () => {
    const events = [
      makeEvent({ start: "2026-11-18 09:00:00", end: "2026-11-18 10:00:00", title: "Later" }),
      makeEvent({ start: "2026-11-16 09:00:00", end: "2026-11-16 10:00:00", title: "First" }),
      makeEvent({ start: "2026-11-25 09:00:00", end: "2026-11-25 10:00:00", title: "Outside" }),
    ];
    const summary = shapeWidgetAgenda(events, {
      viewId: "v1",
      origin: "https://app.example.com",
      today: TODAY,
      lastDay: LAST_DAY,
    });
    expect(summary.events.map((event) => event.title)).toEqual(["First", "Later"]);
    expect(summary.next?.title).toBe("First");
    expect(summary.counts).toEqual({ today: 1, window: 2 });
  });

  it("builds an absolute deep link with the view id", () => {
    const event = makeEvent({
      start: "2026-11-16 09:00:00",
      end: "2026-11-16 10:00:00",
      title: "Briefing",
      eventId: "11111111-1111-1111-1111-111111111111",
      calendarId: "22222222-2222-2222-2222-222222222222",
    });
    const summary = shapeWidgetAgenda([event], {
      viewId: "v1",
      origin: "https://app.example.com/",
      today: TODAY,
      lastDay: LAST_DAY,
    });
    expect(summary.next?.deepLink).toBe(
      "https://app.example.com/dashboard?view=v1&date=2026-11-16&event=11111111-1111-1111-1111-111111111111&_eventCal=22222222-2222-2222-2222-222222222222",
    );
  });

  it("flags pinned events from either pin form", () => {
    const summary = shapeWidgetAgenda(
      [
        makeEvent({
          start: "2026-11-16 09:00:00",
          end: "2026-11-16 10:00:00",
          pinned: true,
        }),
        makeEvent({
          start: "2026-11-17 09:00:00",
          end: "2026-11-17 10:00:00",
          pinnedDepartments: ["cal-1"],
        }),
      ],
      { viewId: "v1", origin: "https://app.example.com", today: TODAY, lastDay: LAST_DAY },
    );
    expect(summary.events.map((event) => event.pinned)).toEqual([true, true]);
  });
});

describe("shapeWidgetPinned", () => {
  it("counts pins and shapes the next one with a deep link", () => {
    const pinned = shapeWidgetPinned(
      [
        {
          title: "Exercise",
          start: "2026-11-21 09:00:00",
          eventId: "p1",
          calendarId: "c1",
        },
      ],
      { viewId: "v1", origin: "https://app.example.com", today: TODAY },
    );
    expect(pinned.count).toBe(1);
    expect(pinned.next).toEqual({
      title: "Exercise",
      daysLeft: 5,
      date: "2026-11-21",
      dateLabel: "Sat 21 Nov",
      deepLink:
        "https://app.example.com/dashboard?view=v1&date=2026-11-21&event=p1&_eventCal=c1",
    });
  });

  it("handles an empty selection", () => {
    expect(
      shapeWidgetPinned([], { viewId: "v1", origin: "https://app.example.com", today: TODAY }),
    ).toEqual({ count: 0, next: null });
  });
});

describe("buildWidgetFlat", () => {
  it("aliases the next event, six rows and the pinned next", () => {
    const events: WidgetAgendaEvent[] = Array.from({ length: 7 }, (_, index) => ({
      id: `e${index}`,
      title: `Event ${index + 1}`,
      date: "2026-11-16",
      endDate: "2026-11-16",
      dateLabel: "Today",
      endDateLabel: "Today",
      time: "09:00",
      when: "Today 09:00",
      allDay: false,
      ongoing: false,
      location: index === 0 ? "Room 1" : "",
      calendar: "Ops",
      color: "blue",
      pinned: false,
      daysUntil: 0,
      deepLink: `https://app.example.com/e${index}`,
    }));
    const flat = buildWidgetFlat({
      updatedLabel: "Updated 16 Nov 09:12",
      viewName: "Agenda",
      viewKind: "agenda",
      todayLabel: "Today 16 Nov",
      events,
      pinned: {
        count: 2,
        next: {
          title: "Exercise",
          daysLeft: 5,
          date: "2026-11-21",
          dateLabel: "Sat 21 Nov",
          deepLink: "https://app.example.com/pinned",
        },
      },
      fallbackLink: "https://app.example.com/dashboard?view=v1",
    });

    expect(flat.nextTitle).toBe("Event 1");
    expect(flat.nextWhere).toBe("Room 1");
    expect(flat.nextLink).toBe("https://app.example.com/e0");
    expect(flat.e1Title).toBe("Event 1");
    expect(flat.e1Where).toBe("Room 1");
    expect(flat.e2Where).toBe("Ops");
    expect(flat.e6Title).toBe("Event 6");
    expect(flat.e7Title).toBeUndefined();
    expect(flat.pinnedCount).toBe("2");
    expect(flat.pinnedNextWhen).toBe("5d");
    expect(flat.pinnedNextLink).toBe("https://app.example.com/pinned");
    expect(flat.eventCount).toBe("7");
  });

  it("falls back gracefully when there are no events", () => {
    const flat = buildWidgetFlat({
      updatedLabel: "Updated 16 Nov 09:12",
      viewName: "Agenda",
      viewKind: "agenda",
      todayLabel: "Today 16 Nov",
      events: [],
      pinned: { count: 0, next: null },
      fallbackLink: "https://app.example.com/dashboard?view=v1",
    });
    expect(flat.nextTitle).toBe("No upcoming events");
    expect(flat.nextLink).toBe("https://app.example.com/dashboard?view=v1");
    expect(flat.pinnedNextWhen).toBe("");
    expect(flat.e1Title).toBeUndefined();
  });
});
