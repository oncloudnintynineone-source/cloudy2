"use server";

import { asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { describeError, findUniqueViolation } from "@/db/pgErrors";
import { calendars, users, type Calendar, type User } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { normalizeEventColor } from "@/lib/events/eventColors";
import { getGoogleIntegration, googleCalendarConfigured } from "@/lib/google";
import { requireAdmin } from "@/lib/session";
import {
  isDepartmentAccessRole,
  isValidEmail,
  listDepartmentAccess,
  reconcileUserAccessChange,
  type DepartmentAccess,
  type DepartmentAccessRole,
} from "@/lib/roster/shares";
import {
  normalizePhone,
  validateCalendarForm,
  validateUserForm,
  type CalendarFormValues,
  type UserFormValues,
  type UserStatus,
} from "@/lib/roster/validate";

export type RosterActionResult =
  | { ok: true; warnings?: string[] }
  | { ok: false; error: string; field?: "phone" | "shortname" | "name" | "email" };

export type ShareActionResult = { ok: true } | { ok: false; error: string };

/** Actor columns for an audit row from the current admin session. */
function actorFrom(session: Awaited<ReturnType<typeof requireAdmin>>) {
  return actorFromUser({
    id: session.user.id,
    name: session.user.name ?? null,
    role: session.user.role,
  });
}

/** Sanitized user snapshot for audit details (never includes the password hash). */
function userSnapshot(user: User, departmentNames: Record<string, string>) {
  return {
    name: user.name,
    shortname: user.shortname,
    phone: user.phone,
    email: user.email,
    birthday: user.birthday,
    role: user.role,
    status: user.status,
    department: user.departmentId ? (departmentNames[user.departmentId] ?? null) : null,
  };
}

async function getCalendarOrNull(calendarId: string): Promise<Calendar | null> {
  const [row] = await db.select().from(calendars).where(eq(calendars.id, calendarId)).limit(1);
  return row ?? null;
}

/** Department (calendar) name for a user's department id, or null. */
async function calendarNameOrNull(calendarId: string | null | undefined): Promise<string | null> {
  if (!calendarId) {
    return null;
  }
  const calendar = await getCalendarOrNull(calendarId);
  return calendar?.name ?? null;
}

/** Department (calendar) id → name map for a set of ids, for audit display. */
async function calendarNamesByIds(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) {
    return {};
  }
  const rows = await db
    .select({ id: calendars.id, name: calendars.name })
    .from(calendars)
    .where(inArray(calendars.id, ids));
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function createUser(input: UserFormValues): Promise<RosterActionResult> {
  const session = await requireAdmin();

  const errors = validateUserForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Check the highlighted fields", field: "phone" };
  }

  const phone = normalizePhone(input.phone)!;
  const department = await calendarNameOrNull(input.departmentId);
  try {
    const [created] = await db
      .insert(users)
      .values({
        name: input.name.trim(),
        shortname: input.shortname,
        phone,
        email: input.email?.trim() || null,
        birthday: input.birthday || null,
        role: input.role,
        status: input.status,
        departmentId: input.departmentId || null,
      })
      .returning({ id: users.id, name: users.name });

    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.userCreate,
      entityType: "user",
      entityId: created.id,
      entityName: created.name,
      method: "createUser",
      details: {
        name: input.name.trim(),
        shortname: input.shortname,
        phone,
        email: input.email?.trim() || null,
        birthday: input.birthday || null,
        role: input.role,
        status: input.status,
        department,
      },
    });
  } catch (error) {
    // Drizzle wraps the PostgresError in a DrizzleQueryError, so the
    // constraint name lives down the .cause chain (see src/db/pgErrors.ts).
    const violation = findUniqueViolation(error);
    if (violation?.constraintName === "users_shortname_idx") {
      return { ok: false, error: "A user with this shortname already exists", field: "shortname" };
    }
    if (violation !== null) {
      return { ok: false, error: "A user with this phone number already exists", field: "phone" };
    }
    throw error;
  }

  revalidatePath("/settings/users");

  const warnings = await reconcileUserAccessChange({
    oldEmail: null,
    newEmail: input.email?.trim() || null,
    oldDepartmentId: null,
    newDepartmentId: input.departmentId || null,
  });
  return warnings.length > 0 ? { ok: true, warnings } : { ok: true };
}

export async function updateUser(id: string, input: UserFormValues): Promise<RosterActionResult> {
  const session = await requireAdmin();

  const errors = validateUserForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Check the highlighted fields", field: "phone" };
  }

  const phone = normalizePhone(input.phone)!;
  const [before] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!before) {
    return { ok: false, error: "User not found", field: "name" };
  }

  const departmentNames = await calendarNamesByIds(
    [...new Set([before.departmentId, input.departmentId].filter((value): value is string => value !== null))],
  );
  const after = userSnapshot(
    {
      ...before,
      name: input.name.trim(),
      shortname: input.shortname,
      phone,
      email: input.email?.trim() || null,
      birthday: input.birthday || null,
      role: input.role,
      status: input.status,
      departmentId: input.departmentId || null,
    },
    departmentNames,
  );

  try {
    await db
      .update(users)
      .set({
        name: input.name.trim(),
        shortname: input.shortname,
        phone,
        email: input.email?.trim() || null,
        birthday: input.birthday || null,
        role: input.role,
        status: input.status,
        departmentId: input.departmentId || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));

    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.userUpdate,
      entityType: "user",
      entityId: id,
      entityName: input.name.trim(),
      method: "updateUser",
      details: diffFields(userSnapshot(before, departmentNames), after),
    });
  } catch (error) {
    // Drizzle wraps the PostgresError in a DrizzleQueryError, so the
    // constraint name lives down the .cause chain (see src/db/pgErrors.ts).
    const violation = findUniqueViolation(error);
    if (violation?.constraintName === "users_shortname_idx") {
      return { ok: false, error: "A user with this shortname already exists", field: "shortname" };
    }
    if (violation !== null) {
      return { ok: false, error: "A user with this phone number already exists", field: "phone" };
    }
    throw error;
  }

  revalidatePath("/settings/users");

  const emailChanged = (before.email ?? "") !== (after.email ?? "");
  const departmentChanged = (before.departmentId ?? null) !== (input.departmentId || null);
  if (emailChanged || departmentChanged) {
    const warnings = await reconcileUserAccessChange({
      oldEmail: before.email,
      newEmail: after.email,
      oldDepartmentId: before.departmentId,
      newDepartmentId: input.departmentId || null,
    });
    return warnings.length > 0 ? { ok: true, warnings } : { ok: true };
  }

  return { ok: true };
}

export async function setUserStatus(id: string, status: UserStatus): Promise<RosterActionResult> {
  const session = await requireAdmin();

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) {
    return { ok: false, error: "User not found" };
  }

  await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id));

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.userStatusChange,
    entityType: "user",
    entityId: id,
      entityName: user.name,
      method: "setUserStatus",
      details: diffFields({ status: user.status }, { status }),
    });

  revalidatePath("/settings/users");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Departments (Google Calendars)
// ---------------------------------------------------------------------------

export async function createDepartment(input: CalendarFormValues): Promise<RosterActionResult> {
  const session = await requireAdmin();

  const errors = validateCalendarForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Name is required", field: "name" };
  }

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured", field: "name" };
  }

  const name = input.name.trim();
  const color = normalizeEventColor(input.color);
  try {
    const integration = await getGoogleIntegration();
    const created = await integration.createCalendar(name);
    const existing = await db.select({ sortOrder: calendars.sortOrder }).from(calendars);
    const nextOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    const [row] = await db
      .insert(calendars)
      .values({ name, googleCalendarId: created.calendarId, kind: "department", color, sortOrder: nextOrder })
      .returning({ id: calendars.id, name: calendars.name });

    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.calendarCreate,
      entityType: "calendar",
      entityId: row.id,
      entityName: row.name,
      method: "createDepartment",
      details: { googleCalendarId: created.calendarId, color },
    });
  } catch (error) {
    if (findUniqueViolation(error) !== null) {
      return {
        ok: false,
        error: "A department with this Google Calendar already exists",
        field: "name",
      };
    }
    return { ok: false, error: describeError(error, "Could not create the department"), field: "name" };
  }

  revalidatePath("/settings/departments");
  revalidatePath("/settings/users");
  revalidatePath("/dashboard");
  revalidatePath("/parade-state");
  return { ok: true };
}

export async function renameDepartment(
  id: string,
  input: CalendarFormValues,
): Promise<RosterActionResult> {
  const session = await requireAdmin();

  const errors = validateCalendarForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Name is required", field: "name" };
  }

  const calendar = await getCalendarOrNull(id);
  if (!calendar) {
    return { ok: false, error: "Department not found", field: "name" };
  }

  const name = input.name.trim();
  const color = normalizeEventColor(input.color);
  try {
    if (name !== calendar.name && googleCalendarConfigured()) {
      const integration = await getGoogleIntegration();
      await integration.renameCalendar(calendar.googleCalendarId, name);
    }
    await db.update(calendars).set({ name, color, updatedAt: new Date() }).where(eq(calendars.id, id));

    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.calendarUpdate,
      entityType: "calendar",
      entityId: id,
      entityName: name,
      method: "renameDepartment",
      details: diffFields({ name: calendar.name, color: calendar.color }, { name, color }),
    });
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not update the department"), field: "name" };
  }

  revalidatePath("/settings/departments");
  revalidatePath("/settings/users");
  revalidatePath("/dashboard");
  revalidatePath("/parade-state");
  return { ok: true };
}

export async function deleteDepartment(id: string): Promise<RosterActionResult> {
  const session = await requireAdmin();

  const calendar = await getCalendarOrNull(id);
  if (!calendar) {
    return { ok: true };
  }

  try {
    if (googleCalendarConfigured()) {
      const integration = await getGoogleIntegration();
      await integration.deleteCalendar(calendar.googleCalendarId);
    }
    await db.delete(calendars).where(eq(calendars.id, id));

    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.calendarDelete,
      entityType: "calendar",
      entityId: id,
      entityName: calendar.name,
      method: "deleteDepartment",
      details: { googleCalendarId: calendar.googleCalendarId },
    });
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not delete the department") };
  }

  revalidatePath("/settings/departments");
  revalidatePath("/settings/users");
  revalidatePath("/dashboard");
  revalidatePath("/parade-state");
  return { ok: true };
}

/**
 * Move a department one step toward the front ("up") or back ("down") of the
 * display order. Renumbering every row first keeps `sortOrder` unique even
 * when legacy rows share values, so the swap always takes effect. No-op at
 * either end. The order is shared by all calendar sub-views (Month/Day/Week)
 * and parade state.
 */
export async function moveDepartment(
  id: string,
  direction: "up" | "down",
): Promise<RosterActionResult> {
  const session = await requireAdmin();

  const rows = await db.select().from(calendars).orderBy(asc(calendars.sortOrder), asc(calendars.name));
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) {
    return { ok: false, error: "Department not found", field: "name" };
  }
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  const neighbor = rows[neighborIndex];
  if (!neighbor) {
    return { ok: true };
  }

  const moved = rows[index];
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i].sortOrder !== i) {
        await tx.update(calendars).set({ sortOrder: i }).where(eq(calendars.id, rows[i].id));
      }
    }
    await tx.update(calendars).set({ sortOrder: neighborIndex }).where(eq(calendars.id, id));
    await tx.update(calendars).set({ sortOrder: index }).where(eq(calendars.id, neighbor.id));
  });

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.calendarUpdate,
    entityType: "calendar",
    entityId: id,
    entityName: moved.name,
    method: "moveDepartment",
    details: diffFields(
      { order: index + 1, name: moved.name },
      { order: neighborIndex + 1, name: moved.name },
    ),
  });

  revalidatePath("/settings/departments");
  revalidatePath("/dashboard");
  revalidatePath("/parade-state");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Calendar sharing
// ---------------------------------------------------------------------------

/** Read the department calendar's access, reconciling assigned readers first. */
export async function getDepartmentAccess(calendarId: string): Promise<DepartmentAccess> {
  await requireAdmin();
  return listDepartmentAccess(calendarId);
}

export async function grantDepartmentAccess(
  calendarId: string,
  email: string,
  role: DepartmentAccessRole,
): Promise<ShareActionResult> {
  const session = await requireAdmin();

  const trimmed = email.trim();
  if (!isValidEmail(trimmed)) {
    return { ok: false, error: "Enter a valid email address" };
  }
  if (!isDepartmentAccessRole(role)) {
    return { ok: false, error: "Invalid access level" };
  }

  const calendar = await getCalendarOrNull(calendarId);
  if (!calendar) {
    return { ok: false, error: "Department not found" };
  }
  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  try {
    const integration = await getGoogleIntegration();
    await integration.setCalendarAccess(calendar.googleCalendarId, trimmed, role);
  } catch (error) {
    return { ok: false, error: describeError(error, "Google Calendar request failed") };
  }

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.accessGrant,
    entityType: "calendar",
    entityId: calendar.id,
      entityName: calendar.name,
      method: "grantDepartmentAccess",
      details: { email: trimmed, ...diffFields({ role: null }, { role }) },
    });

  return { ok: true };
}

/** Change the access level of an existing additional-access rule. */
export async function updateDepartmentAccess(
  calendarId: string,
  email: string,
  role: DepartmentAccessRole,
): Promise<ShareActionResult> {
  const session = await requireAdmin();

  const trimmed = email.trim();
  if (!isValidEmail(trimmed)) {
    return { ok: false, error: "Enter a valid email address" };
  }
  if (!isDepartmentAccessRole(role)) {
    return { ok: false, error: "Invalid access level" };
  }

  const calendar = await getCalendarOrNull(calendarId);
  if (!calendar) {
    return { ok: false, error: "Department not found" };
  }
  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  let previousRole: string | null = null;
  try {
    const integration = await getGoogleIntegration();
    const accessRules = await integration.listCalendarAccess(calendar.googleCalendarId);
    previousRole =
      accessRules.find((rule) => rule.email.toLowerCase() === trimmed.toLowerCase())?.role ?? null;
    await integration.setCalendarAccess(calendar.googleCalendarId, trimmed, role);
  } catch (error) {
    return { ok: false, error: describeError(error, "Google Calendar request failed") };
  }

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.accessUpdate,
    entityType: "calendar",
    entityId: calendar.id,
    entityName: calendar.name,
    method: "updateDepartmentAccess",
    details: { email: trimmed, ...diffFields({ role: previousRole }, { role }) },
  });

  return { ok: true };
}

export async function revokeDepartmentAccess(
  calendarId: string,
  email: string,
): Promise<ShareActionResult> {
  const session = await requireAdmin();

  const trimmed = email.trim();
  const calendar = await getCalendarOrNull(calendarId);
  if (!calendar) {
    return { ok: false, error: "Department not found" };
  }
  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  let previousRole: string | null = null;
  try {
    const integration = await getGoogleIntegration();
    const accessRules = await integration.listCalendarAccess(calendar.googleCalendarId);
    previousRole =
      accessRules.find((rule) => rule.email.toLowerCase() === trimmed.toLowerCase())?.role ?? null;
    await integration.removeCalendarAccess(calendar.googleCalendarId, trimmed);
  } catch (error) {
    return { ok: false, error: describeError(error, "Google Calendar request failed") };
  }

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.accessRevoke,
    entityType: "calendar",
    entityId: calendar.id,
    entityName: calendar.name,
    method: "revokeDepartmentAccess",
    details: { email: trimmed, ...diffFields({ role: previousRole }, { role: null }) },
  });

  return { ok: true };
}
