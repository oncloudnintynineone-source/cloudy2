/**
 * Server-side execution of the admin event-type reference migration.
 *
 * The client drives the run one bounded chunk at a time (docs/event-lifecycle
 * §1.10.1): each request scans a small number of Google pages, patches the
 * matching copies, invalidates the touched month caches, and returns an opaque
 * cursor. The run is idempotent — migrated copies no longer match the source
 * name — so an aborted or failed run can simply resume/restart.
 */

import { formatInstantToNaive, monthsInRange } from "@/lib/events/datetime";
import { mapCalendarItem, listCalendars } from "@/lib/events/queries";
import { invalidatePinnedSelectionCache } from "@/lib/events/pinnedCache";
import { parseEventPeople, parseEventTitle } from "@/lib/events/notes";
import { displayTitleOptions, resolveDisplayTitles } from "@/lib/events/eventTitleDisplay";
import { getGoogleIntegration, googleCalendarConfigured } from "@/lib/google";
import type { GcalEventItem, GcalEventPatch } from "@/lib/google/types";
import { invalidateGcalCache } from "@/lib/google/eventsCache";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { getSettings } from "@/lib/settings/queries";
import { getUsersByIds } from "@/lib/roster/queries";
import { mapWithConcurrency } from "@/lib/async";
import {
  isMigrationCursor,
  migrationYears,
  rewriteEventTypeNotes,
  selectMigrationBatch,
  type MigrationCursor,
} from "./migration";

/** Page/update budget per HTTP request, so one call stays well under timeouts. */
const MAX_LIST_PAGES_PER_CHUNK = 8;
const MAX_PATCHES_PER_CHUNK = 200;
/** Bounded Google write concurrency (quota-friendly). */
const PATCH_CONCURRENCY = 3;

export interface MigrationChunkInput {
  fromName: string;
  toTypeId: string;
  fromDate: string;
  toDate: string;
  updateTitles: boolean;
  cursor: MigrationCursor | null;
}

export interface MigrationChunkResult {
  ok: true;
  /** Events examined in this request (new page items only, not re-scanned). */
  scanned: number;
  /** Events whose notes referenced the source name in this request. */
  matched: number;
  /** Copies successfully patched in this request. */
  updated: number;
  /** Copies that failed to patch in this request. */
  failed: number;
  errors: string[];
  cursor: MigrationCursor | null;
  done: boolean;
  /** Total department calendars scanned by this run. */
  calendarCount: number;
  /** Total year windows in the selected range. */
  yearCount: number;
}

export type RunMigrationChunk =
  MigrationChunkResult | { ok: false; error: string; retryable: boolean };

function dayOf(value: Date): string {
  return formatInstantToNaive(value).slice(0, 10);
}

/**
 * Render the updated Google summary for one copy. Uses the same projection and
 * display-title resolver as the dashboard, so a migrated summary matches what
 * the app shows for the target type. Legacy copies without a stored raw title
 * return null (their hand-edited summary is preserved).
 */
function renderMigratedTitle(input: {
  item: GcalEventItem;
  description: string;
  calendar: { id: string; name: string; color: string | null };
  target: { name: string; shortname: string | null; color: string | null };
  usersById: ReturnType<typeof displayTitleOptions>["usersById"];
  calendarsById: Map<string, string>;
  nameTemplate: string;
  masterRecipe: ReturnType<typeof displayTitleOptions>["masterRecipe"];
}): string | null {
  if (parseEventTitle(input.item.description) === null) {
    return null;
  }
  const projected = mapCalendarItem(
    input.calendar,
    { ...input.item, description: input.description },
    { typeFilter: [], userFilter: [] },
    new Map([[input.target.name, input.target.color]]),
  );
  if (!projected) {
    return null;
  }
  const opts = displayTitleOptions("month", {
    nameTemplate: input.nameTemplate,
    masterRecipe: input.masterRecipe,
    assignments: {},
    templates: [],
    usersById: input.usersById,
    eventTypesByName: new Map([
      [input.target.name, { name: input.target.name, shortname: input.target.shortname }],
    ]),
    calendarsById: input.calendarsById,
  });
  return resolveDisplayTitles([projected], opts)[0]?.title ?? null;
}

/**
 * Scan and migrate one bounded slice. Validation errors are returned as
 * `{ ok: false }`; Google failures are retryable and leave the cursor intact.
 */
export async function runMigrationChunk(input: MigrationChunkInput): Promise<RunMigrationChunk> {
  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured", retryable: false };
  }

  const years = migrationYears(input.fromDate, input.toDate);
  if (years.length === 0) {
    return { ok: false, error: "Select a valid date range", retryable: false };
  }

  const [calendars, eventTypes, settings] = await Promise.all([
    listCalendars(),
    listEventTypes(),
    getSettings(),
  ]);
  const target = eventTypes.find((eventType) => eventType.id === input.toTypeId);
  if (!target) {
    return { ok: false, error: "Target event type not found", retryable: false };
  }
  if (input.fromName === target.name && !input.updateTitles) {
    return {
      ok: false,
      error: "Choose a different source name or enable title updates",
      retryable: false,
    };
  }

  const scanCalendars = calendars.filter((calendar) => Boolean(calendar.googleCalendarId));
  if (scanCalendars.length === 0) {
    return { ok: false, error: "No department calendars to scan", retryable: false };
  }

  const initialCursor: MigrationCursor = input.cursor ?? {
    yearIndex: 0,
    calendarIndex: 0,
    pageToken: null,
    skip: 0,
  };
  if (!isMigrationCursor(initialCursor, years.length, scanCalendars.length)) {
    return { ok: false, error: "Invalid migration cursor", retryable: false };
  }
  const cursor: MigrationCursor = { ...initialCursor };

  const integration = await getGoogleIntegration();
  const calendarsById = new Map(scanCalendars.map((calendar) => [calendar.id, calendar.name]));

  let scanned = 0;
  let matched = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];
  const touchedGoogleIds = new Set<string>();
  const touchedMonths = new Set<string>();
  let pages = 0;

  const recordError = (item: GcalEventItem, error: unknown) => {
    failed += 1;
    if (errors.length < 5) {
      const message = error instanceof Error ? error.message : "Unknown Google error";
      errors.push(`${item.title || item.id}: ${message}`);
    }
  };

  try {
    while (pages < MAX_LIST_PAGES_PER_CHUNK) {
      if (cursor.yearIndex >= years.length) {
        break;
      }
      const window = years[cursor.yearIndex];
      const calendar = scanCalendars[cursor.calendarIndex];
      const googleCalendarId = calendar.googleCalendarId;

      let page;
      try {
        page = await integration.listEventPages(
          googleCalendarId,
          window.start,
          window.end,
          cursor.pageToken ?? undefined,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google Calendar request failed";
        return { ok: false, error: message, retryable: true };
      }
      pages += 1;

      const remaining = page.items.slice(cursor.skip);
      const budget = MAX_PATCHES_PER_CHUNK - updated;
      if (budget <= 0) {
        return {
          ok: true,
          scanned,
          matched,
          updated,
          failed,
          errors,
          cursor,
          done: false,
          calendarCount: scanCalendars.length,
          yearCount: years.length,
        };
      }

      // Pick the matching copies this request will patch. `skip` is an offset
      // into the *page items*, not the filtered matches, so resumed requests are
      // correct even though already-migrated copies disappear from the match set.
      const batch = selectMigrationBatch(remaining, input.fromName, budget);
      const processable = batch.selected;
      const consumed = batch.consumed;

      scanned += consumed;
      matched += processable.length;

      if (processable.length > 0) {
        const userIds = processable.flatMap((item) => parseEventPeople(item.description).userIds);
        const users = await getUsersByIds(userIds);
        const usersById = new Map(
          users.map((user) => [
            user.id,
            {
              id: user.id,
              name: user.name,
              shortname: user.shortname,
              departmentName: user.departmentName,
            },
          ]),
        );

        await mapWithConcurrency(processable, PATCH_CONCURRENCY, async (item) => {
          const rewrite = rewriteEventTypeNotes(item.description, input.fromName, target.name);
          if (!rewrite.matched) {
            return;
          }
          const patch: GcalEventPatch = { calendarId: googleCalendarId };
          if (rewrite.changed) {
            patch.description = rewrite.description;
          }
          if (input.updateTitles) {
            const title = renderMigratedTitle({
              item,
              description: rewrite.description,
              calendar,
              target,
              usersById,
              calendarsById,
              nameTemplate: settings.nameTemplate,
              masterRecipe: settings.eventTitleRecipe,
            });
            if (title && title !== item.title) {
              patch.title = title;
            }
          }
          if (patch.title === undefined && patch.description === undefined) {
            return;
          }
          try {
            await integration.patchEvent(item.id, patch);
            updated += 1;
            touchedGoogleIds.add(googleCalendarId);
            for (const month of monthsInRange(dayOf(item.start), dayOf(item.end))) {
              touchedMonths.add(month);
            }
          } catch (error) {
            recordError(item, error);
          }
        });
      }

      // Advance the cursor past every item examined. A stopped batch (budget
      // reached) returns with the same page token and the new offset.
      cursor.skip += consumed;
      if (batch.stopped) {
        // More page items remain unexamined: the update budget stopped us.
        return {
          ok: true,
          scanned,
          matched,
          updated,
          failed,
          errors,
          cursor,
          done: false,
          calendarCount: scanCalendars.length,
          yearCount: years.length,
        };
      }

      if (page.nextPageToken) {
        cursor.pageToken = page.nextPageToken;
        cursor.skip = 0;
        continue;
      }

      cursor.pageToken = null;
      cursor.skip = 0;
      cursor.calendarIndex += 1;
      if (cursor.calendarIndex >= scanCalendars.length) {
        cursor.calendarIndex = 0;
        cursor.yearIndex += 1;
      }
    }

    const done = cursor.yearIndex >= years.length;
    return {
      ok: true,
      scanned,
      matched,
      updated,
      failed,
      errors,
      cursor: done ? null : cursor,
      done,
      calendarCount: scanCalendars.length,
      yearCount: years.length,
    };
  } finally {
    if (touchedMonths.size > 0) {
      await invalidateGcalCache([...touchedGoogleIds], [...touchedMonths]);
      await invalidatePinnedSelectionCache();
    }
  }
}
