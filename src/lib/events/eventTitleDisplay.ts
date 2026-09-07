import { formatFullName } from "@/lib/settings/formatName";
import { formatEventTitle } from "@/lib/settings/formatEventTitle";
import { naiveTimePart } from "@/lib/events/timeOptions";
import type { CalendarEvent } from "@/lib/events/queries";

export interface DisplayTitleUser {
  id: string;
  name: string;
  shortname: string | null;
  departmentName: string | null;
}

export interface DisplayTitleEventType {
  name: string;
  shortname: string | null;
}

export interface DisplayTitleCalendar {
  id: string;
  name: string;
}

export interface DisplayTitleTemplate {
  id: string;
  template: string;
  label: string;
}

export function resolveDisplayTitles(
  events: CalendarEvent[],
  opts: {
    view: string;
    nameTemplate: string;
    masterTemplate: string;
    assignments: Record<string, string>;
    templates: DisplayTitleTemplate[];
    usersById: Map<string, DisplayTitleUser>;
    eventTypesByName: Map<string, DisplayTitleEventType>;
    calendarsById: Map<string, string>;
  },
): CalendarEvent[] {
  const templateMap = new Map(opts.templates.map((t) => [t.id, t.template] as const));
  return events.map((event) => {
    if (event.payload.external) return event;
    const rawTitle = event.payload.rawTitle ?? "";
    const assignedId = opts.assignments[opts.view] ?? null;
    const viewTemplate = assignedId ? templateMap.get(assignedId) : undefined;
    const template = viewTemplate ?? opts.masterTemplate;

    // People for the {people} token = the stored attendees exactly: the
    // organizer is shown only when they tagged themselves (legacy events that
    // auto-invited the organizer still carry them in `inviteeUserIds`).
    const people = event.payload.inviteeUserIds.flatMap((id) => {
      const user = opts.usersById.get(id);
      if (!user) return [];
      return [
        {
          full: user.name,
          acronym: user.shortname || user.name,
          fqn: formatFullName(
            { name: user.name, departmentName: user.departmentName },
            opts.nameTemplate,
          ),
        },
      ];
    });

    const departments = event.payload.inviteeDepartmentIds
      .map((id) => opts.calendarsById.get(id) ?? "")
      .filter(Boolean);

    const eventTypeName = event.payload.eventType;
    const eventTypeRow = eventTypeName ? opts.eventTypesByName.get(eventTypeName) : undefined;
    const eventType = eventTypeName
      ? { name: eventTypeName, acronym: eventTypeRow?.shortname || eventTypeName }
      : null;

    const rendered = formatEventTitle(
      {
        description: rawTitle.trim(),
        eventType,
        people,
        departments,
        location: event.payload.location ?? "",
        timeOption: event.payload.timeOption,
        startTime: naiveTimePart(event.start),
        endTime: naiveTimePart(event.end),
        startAmPm: event.payload.startAmPm ?? "",
        endAmPm: event.payload.endAmPm ?? "",
      },
      template,
    );
    const displayTitle = rendered || rawTitle.trim();

    const finalTitle = displayTitle || event.title;
    if (finalTitle === event.title) return event;
    return { ...event, title: finalTitle };
  });
}
