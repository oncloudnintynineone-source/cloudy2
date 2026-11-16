import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarRangeData } from "@/lib/events/queries";
import type { GcalEventItem } from "@/lib/google/types";
import type { EventNotes } from "@/lib/events/notes";
import { encodeEventNotes } from "@/lib/events/notes";
import type { SettingsView } from "@/lib/settings/queries";
import { DEFAULT_TITLE_RECIPE } from "@/lib/settings/titleRecipe";

import { projectWidgetViewEvents, resolveWidgetView } from "./viewEvents";

const mocks = vi.hoisted(() => ({
  getDashboardViews: vi.fn(),
  listCalendars: vi.fn(),
  readCalendarRange: vi.fn(),
  listEventTypes: vi.fn(),
  listUsers: vi.fn(),
  getSettings: vi.fn(),
  listEventTitleTemplates: vi.fn(),
}));

vi.mock("@/lib/dashboardViews/queries", () => ({
  getDashboardViews: mocks.getDashboardViews,
}));

// Keep the real (pure) projection while stubbing its DB-backed config reads.
vi.mock("@/lib/events/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/events/queries")>();
  return {
    ...actual,
    listCalendars: mocks.listCalendars,
    readCalendarRange: mocks.readCalendarRange,
  };
});

vi.mock("@/lib/eventTypes/queries", () => ({ listEventTypes: mocks.listEventTypes }));
vi.mock("@/lib/roster/queries", () => ({ listUsers: mocks.listUsers }));
vi.mock("@/lib/settings/queries", () => ({
  getSettings: mocks.getSettings,
  listEventTitleTemplates: mocks.listEventTitleTemplates,
}));

const ACTOR = { id: "11111111-1111-1111-1111-111111111111", role: "user" as const };
const VIEW = "22222222-2222-2222-2222-222222222222";
const OPS = "33333333-3333-3333-3333-333333333333";
const LOGS = "44444444-4444-4444-4444-444444444444";

const CALENDARS = [
  { id: OPS, name: "Ops", googleCalendarId: "g-ops", color: null, sortOrder: 0 },
  { id: LOGS, name: "Logs", googleCalendarId: "g-logs", color: null, sortOrder: 1 },
] as unknown as Awaited<ReturnType<typeof import("@/lib/events/queries").listCalendars>>;

const EVENT_TYPES = [
  { name: "Duty", shortname: "DUT", color: null },
  { name: "Leave", shortname: "LV", color: null },
] as unknown as Awaited<ReturnType<typeof import("@/lib/eventTypes/queries").listEventTypes>>;

const USERS = [
  {
    id: ACTOR.id,
    name: "Alice",
    shortname: "AL",
    phone: "111",
    email: null,
    birthday: null,
    role: "user",
    status: "active",
    department: { id: OPS, name: "Ops", sortOrder: 0 },
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    name: "Bob",
    shortname: "BO",
    phone: "222",
    email: null,
    birthday: null,
    role: "user",
    status: "active",
    department: { id: LOGS, name: "Logs", sortOrder: 1 },
  },
] as unknown as Awaited<ReturnType<typeof import("@/lib/roster/queries").listUsers>>;

const SETTINGS = {
  nameTemplate: "{name}",
  eventTitleRecipe: DEFAULT_TITLE_RECIPE,
  eventTitleTemplateAssignments: {},
} as unknown as SettingsView;

/** The reported case: a Month view filtered to one calendar + one user + Duty. */
const TAB = {
  id: VIEW,
  kind: "month" as const,
  name: "Duty only",
  sortOrder: 0,
  filters: { cal: [OPS], users: [ACTOR.id], types: ["Duty"], text: null },
  createdVia: "manual" as const,
};

function item(id: string, calendarId: string, notes: EventNotes): GcalEventItem {
  return {
    id,
    calendarId,
    title: notes.title ?? id,
    description: encodeEventNotes(notes),
    start: new Date("2026-11-10T01:00:00Z"),
    end: new Date("2026-11-10T02:00:00Z"),
    allDay: false,
    location: "",
  };
}

function rangeData(): CalendarRangeData {
  return {
    rows: CALENDARS as unknown as CalendarRangeData["rows"],
    typeColors: new Map<string, string | null>([
      ["Duty", null],
      ["Leave", null],
    ]),
    cached: {
      events: {
        "2026-11": {
          "g-ops": [
            item("g-duty-u1", OPS, {
              eventId: "evt-duty-u1",
              eventType: "Duty",
              inviteeUsers: [ACTOR.id],
              title: "Duty",
            }),
            item("g-leave-u1", OPS, {
              eventId: "evt-leave-u1",
              eventType: "Leave",
              inviteeUsers: [ACTOR.id],
              title: "Leave",
            }),
            item("g-duty-u2", OPS, {
              eventId: "evt-duty-u2",
              eventType: "Duty",
              inviteeUsers: ["55555555-5555-5555-5555-555555555555"],
              title: "Duty for Bob",
            }),
            item("g-duty-dept", OPS, {
              eventId: "evt-duty-dept",
              eventType: "Duty",
              inviteeDepartments: [OPS],
              title: "Department duty",
            }),
            item("g-duty-parade", OPS, {
              eventId: "evt-duty-parade",
              eventType: "Duty",
              inviteeUsers: [ACTOR.id],
              title: "Parade",
            }),
          ],
          "g-logs": [
            item("g-logs-duty-u1", LOGS, {
              eventId: "evt-logs-duty-u1",
              eventType: "Duty",
              inviteeUsers: [ACTOR.id],
              title: "Logs duty",
            }),
          ],
        },
      },
      allServed: true,
    },
    months: ["2026-11"],
  };
}

beforeEach(() => {
  mocks.getDashboardViews.mockResolvedValue([TAB]);
  mocks.listCalendars.mockResolvedValue(CALENDARS);
  mocks.listEventTypes.mockResolvedValue(EVENT_TYPES);
  mocks.listUsers.mockResolvedValue(USERS);
  mocks.getSettings.mockResolvedValue(SETTINGS);
  mocks.listEventTitleTemplates.mockResolvedValue([]);
});

describe("resolveWidgetView", () => {
  it("resolves the stored view's filters instead of the role defaults", async () => {
    const config = await resolveWidgetView(ACTOR, VIEW);

    expect(config.tab.id).toBe(VIEW);
    expect(config.filters).toEqual({
      cal: [OPS],
      users: [ACTOR.id],
      types: ["Duty"],
      text: null,
    });
    expect(config.filterSummary).toBe("1/2 calendars · 1 user · 1 type");
  });
});

describe("projectWidgetViewEvents", () => {
  it("applies the view's calendars, users and event types to the feed", async () => {
    const config = await resolveWidgetView(ACTOR, VIEW);
    const events = projectWidgetViewEvents(rangeData(), config);

    expect(events.map((event) => event.payload.eventId).sort()).toEqual([
      "evt-duty-dept",
      "evt-duty-parade",
      "evt-duty-u1",
    ]);
  });

  it("applies the event-name text filter last", async () => {
    const config = await resolveWidgetView(ACTOR, VIEW);
    const events = projectWidgetViewEvents(rangeData(), {
      ...config,
      filters: { ...config.filters, text: "parade" },
    });

    expect(events.map((event) => event.payload.eventId)).toEqual(["evt-duty-parade"]);
  });
});
