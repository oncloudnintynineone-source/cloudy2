/**
 * Server-side label rendering for the Double Booking report's events. Each
 * event is rendered through the admin's title-template engine — the
 * `doubleBooking` assignment target, else Master — so the clash report shows
 * exactly the fields admins chose (type, description, people, departments,
 * location, time) with their decorations. Pure (no I/O). See
 * docs/user-clashes.md §1.8 and docs/event-lifecycle.md §1.8.5.
 */

import type { ClashEventInput } from "@/lib/events/clashes";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { naiveTimePart } from "@/lib/events/timeOptions";
import { formatFullName } from "@/lib/settings/formatName";
import {
  renderTitleRecipe,
  type EventTitlePerson,
  type EventTitleRecipeInput,
  type TitleRecipe,
} from "@/lib/settings/titleRecipe";

export interface ClashLabelUser {
  name: string;
  shortname: string | null;
  departmentName: string | null;
}

export interface ClashLabelContext {
  nameTemplate: string;
  usersById: ReadonlyMap<string, ClashLabelUser>;
  calendarNames: ReadonlyMap<string, string>;
}

/** Build the recipe input for one clash event (mirrors `resolveDisplayTitles`). */
export function clashRecipeInput(
  event: ClashEventInput,
  ctx: ClashLabelContext,
): EventTitleRecipeInput {
  const people: EventTitlePerson[] = event.people.userIds.flatMap((id) => {
    const user = ctx.usersById.get(id);
    if (!user) {
      return [];
    }
    return [
      {
        full: user.name,
        acronym: user.shortname || user.name,
        fqn: formatFullName(
          { name: user.name, departmentName: user.departmentName },
          ctx.nameTemplate,
        ),
      },
    ];
  });
  const departments = event.people.departmentIds
    .map((id) => ctx.calendarNames.get(id) ?? "")
    .filter(Boolean);
  return {
    description: (event.rawTitle ?? "").trim(),
    eventType: event.typeName
      ? { name: event.typeName, acronym: event.typeShortname || event.typeName }
      : null,
    people,
    departments,
    location: event.location ?? "",
    timeOption: event.timeOption,
    startTime: naiveTimePart(formatInstantToNaive(event.start)),
    endTime: naiveTimePart(formatInstantToNaive(event.end)),
    startAmPm: event.startAmPm ?? "",
    endAmPm: event.endAmPm ?? "",
  };
}

/**
 * The label shown for one clash event on the Double Booking report, rendered
 * through the admin's title-template engine. External events (no app notes)
 * bypass the recipe and keep their stored Google summary verbatim — mirroring
 * `resolveDisplayTitles` on the dashboard, so an external title is never
 * rebuilt from the mostly-empty parsed fields. Internal events fall back to the
 * raw title, then the stored summary, when the recipe renders nothing.
 */
export function clashLabelFor(
  event: ClashEventInput,
  recipe: TitleRecipe,
  ctx: ClashLabelContext,
): string {
  if (event.external) {
    return event.title;
  }
  const rendered = renderTitleRecipe(clashRecipeInput(event, ctx), recipe);
  return rendered || (event.rawTitle ?? "").trim() || event.title;
}
