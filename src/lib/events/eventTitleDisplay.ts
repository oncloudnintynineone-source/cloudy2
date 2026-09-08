import { formatFullName } from "@/lib/settings/formatName";
import { renderTitleRecipe, type EventTitlePerson, type TitleRecipe } from "@/lib/settings/titleRecipe";
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
  label: string;
  recipe: TitleRecipe;
}

export function resolveDisplayTitles(
  events: CalendarEvent[],
  opts: {
    view: string;
    nameTemplate: string;
    masterRecipe: TitleRecipe;
    assignments: Record<string, string>;
    templates: DisplayTitleTemplate[];
    usersById: Map<string, DisplayTitleUser>;
    eventTypesByName: Map<string, DisplayTitleEventType>;
    calendarsById: Map<string, string>;
  },
): CalendarEvent[] {
  const recipeMap = new Map(opts.templates.map((t) => [t.id, t.recipe] as const));
  return events.map((event) => {
    if (event.payload.external) return event;
    const rawTitle = event.payload.rawTitle ?? "";
    const assignedId = opts.assignments[opts.view] ?? null;
    const viewRecipe = assignedId ? recipeMap.get(assignedId) : undefined;
    const recipe = viewRecipe ?? opts.masterRecipe;

    // People for the recipe's people segment = the stored attendees exactly:
    // the organizer is shown only when they tagged themselves (legacy events
    // that auto-invited the organizer still carry them in `inviteeUserIds`).
    const people: EventTitlePerson[] = event.payload.inviteeUserIds.flatMap((id) => {
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

    const rendered = renderTitleRecipe(
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
      recipe,
    );
    const displayTitle = rendered || rawTitle.trim();

    const finalTitle = displayTitle || event.title;
    if (finalTitle === event.title) return event;
    return { ...event, title: finalTitle };
  });
}
