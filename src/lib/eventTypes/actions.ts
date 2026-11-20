"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { uniqueViolationResult } from "@/db/pgErrors";
import { eventTypes, eventTypeGroups, type EventType } from "@/db/schema";
import { commitAdminWrite } from "@/lib/actions/adminWrite";
import type { ActionResult } from "@/lib/actions/result";
import { AUDIT_ACTIONS } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { requireAdmin } from "@/lib/session";
import { validateEventTypeForm, type EventTypeFormValues } from "@/lib/eventTypes/validate";
import { formatColorLabel, normalizeEventColor } from "@/lib/events/eventColors";
import {
  isLocationCategory,
  LOCATION_CATEGORY_LABELS,
  normalizeAllowedLocations,
} from "@/lib/events/locationPolicy";
import { isTimeOption, normalizeTimeOptions, TIME_OPTION_LABELS } from "@/lib/events/timeOptions";

export interface EventTypeRenameMigrationHint {
  /** The name events may still carry in their notes (the pre-rename name). */
  fromName: string;
  /** The saved type to migrate those references to. */
  toTypeId: string;
  nameChanged: boolean;
  shortnameChanged: boolean;
}

export type EventTypeActionResult = ActionResult<
  { migration?: EventTypeRenameMigrationHint },
  "name" | "shortname" | "timeOptions" | "allowedLocations" | "groupId"
>;

/** The display label a group id maps to in audit details (null = ungrouped). */
async function getGroupNameOrNull(groupId: string | null): Promise<string | null> {
  if (!groupId) {
    return null;
  }
  const [row] = await db
    .select({ name: eventTypeGroups.name })
    .from(eventTypeGroups)
    .where(eq(eventTypeGroups.id, groupId))
    .limit(1);
  return row ? row.name : null;
}

async function getEventTypeOrNull(id: string): Promise<EventType | null> {
  const [row] = await db.select().from(eventTypes).where(eq(eventTypes.id, id)).limit(1);
  return row ?? null;
}

/** Display labels for a set of time options, stored in audit details. */
function timeOptionLabels(options: string[]): string[] {
  return options.map((option) => (isTimeOption(option) ? TIME_OPTION_LABELS[option] : option));
}

/** Display labels for the allowed-location matrix, stored in audit details. */
function allowedLocationLabels(locations: string[]): string[] {
  return locations.map((location) =>
    isLocationCategory(location) ? LOCATION_CATEGORY_LABELS[location] : location,
  );
}

export async function createEventType(input: EventTypeFormValues): Promise<EventTypeActionResult> {
  const session = await requireAdmin();

  const errors = validateEventTypeForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Name is required", field: "name" };
  }

  const name = input.name.trim();
  const shortname = input.shortname.trim();
  const timeOptions = normalizeTimeOptions(input.timeOptions);
  const allowedLocations = normalizeAllowedLocations(input.allowedLocations);
  const showRemarks = input.showRemarks !== false;
  const showInvitees = input.showInvitees !== false;
  const showLocation = input.showLocation !== false;
  const excludeFromClash = input.excludeFromClash === true;
  const color = normalizeEventColor(input.color);
  const groupId = input.groupId?.trim() || null;
  const groupName = await getGroupNameOrNull(groupId);
  if (groupId !== null && groupName === null) {
    return { ok: false, error: "Event type group not found", field: "groupId" };
  }
  try {
    const [created] = await db
      .insert(eventTypes)
      .values({
        name,
        shortname,
        timeOptions,
        allowedLocations,
        showRemarks,
        showInvitees,
        showLocation,
        excludeFromClash,
        color,
        groupId,
      })
      .returning({ id: eventTypes.id, name: eventTypes.name });

    await commitAdminWrite({
      session,
      action: AUDIT_ACTIONS.eventTypeCreate,
      entityType: "eventType",
      entityId: created.id,
      entityName: created.name,
      method: "createEventType",
      details: {
        name,
        shortname,
        group: groupName ?? "Ungrouped",
        timeOptions: timeOptionLabels(timeOptions),
        allowedLocations: allowedLocationLabels(allowedLocations),
        showRemarks,
        showInvitees,
        showLocation,
        excludeFromClash,
        color: formatColorLabel(color, name),
      },
      effect: "eventTypes",
    });
  } catch (error) {
    // Drizzle wraps the PostgresError in a DrizzleQueryError, so the
    // constraint name lives down the .cause chain (see src/db/pgErrors.ts).
    const mapped = uniqueViolationResult(
      error,
      {
        event_types_shortname_idx: {
          error: "An event type with this shortname already exists",
          field: "shortname",
        },
      },
      { error: "An event type with this name already exists", field: "name" },
    );
    if (mapped) {
      return mapped;
    }
    throw error;
  }

  return { ok: true };
}

export async function renameEventType(
  id: string,
  input: EventTypeFormValues,
): Promise<EventTypeActionResult> {
  const session = await requireAdmin();

  const errors = validateEventTypeForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Name is required", field: "name" };
  }

  const existing = await getEventTypeOrNull(id);
  if (!existing) {
    return { ok: false, error: "Event type not found", field: "name" };
  }

  const name = input.name.trim();
  const shortname = input.shortname.trim();
  const timeOptions = normalizeTimeOptions(input.timeOptions);
  const allowedLocations = normalizeAllowedLocations(input.allowedLocations);
  const showRemarks = input.showRemarks !== false;
  const showInvitees = input.showInvitees !== false;
  const showLocation = input.showLocation !== false;
  const excludeFromClash = input.excludeFromClash === true;
  const color = normalizeEventColor(input.color);
  const groupId = input.groupId?.trim() || null;
  const groupName = await getGroupNameOrNull(groupId);
  if (groupId !== null && groupName === null) {
    return { ok: false, error: "Event type group not found", field: "groupId" };
  }
  const existingGroupLabel = (await getGroupNameOrNull(existing.groupId)) ?? "Ungrouped";
  try {
    await db
      .update(eventTypes)
      .set({
        name,
        shortname,
        timeOptions,
        allowedLocations,
        showRemarks,
        showInvitees,
        showLocation,
        excludeFromClash,
        color,
        groupId,
        updatedAt: new Date(),
      })
      .where(eq(eventTypes.id, id));

    await commitAdminWrite({
      session,
      action: AUDIT_ACTIONS.eventTypeRename,
      entityType: "eventType",
      entityId: id,
      entityName: name,
      method: "renameEventType",
      details: diffFields(
        {
          name: existing.name,
          shortname: existing.shortname,
          group: existingGroupLabel,
          timeOptions: timeOptionLabels(existing.timeOptions),
          allowedLocations: allowedLocationLabels(
            normalizeAllowedLocations(existing.allowedLocations),
          ),
          showRemarks: existing.showRemarks,
          showInvitees: existing.showInvitees,
          showLocation: existing.showLocation,
          excludeFromClash: existing.excludeFromClash,
          color: formatColorLabel(existing.color, existing.name),
        },
        {
          name,
          shortname,
          group: groupName ?? "Ungrouped",
          timeOptions: timeOptionLabels(timeOptions),
          allowedLocations: allowedLocationLabels(allowedLocations),
          showRemarks,
          showInvitees,
          showLocation,
          excludeFromClash,
          color: formatColorLabel(color, name),
        },
      ),
      effect: "eventTypes",
    });
  } catch (error) {
    // Drizzle wraps the PostgresError in a DrizzleQueryError, so the
    // constraint name lives down the .cause chain (see src/db/pgErrors.ts).
    const mapped = uniqueViolationResult(
      error,
      {
        event_types_shortname_idx: {
          error: "An event type with this shortname already exists",
          field: "shortname",
        },
      },
      { error: "An event type with this name already exists", field: "name" },
    );
    if (mapped) {
      return mapped;
    }
    throw error;
  }

  const nameChanged = existing.name !== name;
  const shortnameChanged = (existing.shortname ?? "") !== shortname;
  return {
    ok: true,
    migration:
      nameChanged || shortnameChanged
        ? { fromName: existing.name, toTypeId: id, nameChanged, shortnameChanged }
        : undefined,
  };
}

export async function deleteEventType(id: string): Promise<EventTypeActionResult> {
  const session = await requireAdmin();

  const existing = await getEventTypeOrNull(id);
  if (!existing) {
    return { ok: true };
  }

  await db.delete(eventTypes).where(eq(eventTypes.id, id));

  await commitAdminWrite({
    session,
    action: AUDIT_ACTIONS.eventTypeDelete,
    entityType: "eventType",
    entityId: id,
    entityName: existing.name,
    method: "deleteEventType",
    effect: "eventTypes",
  });
  return { ok: true };
}
