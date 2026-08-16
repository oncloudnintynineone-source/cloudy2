"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { calendars, users, type Calendar, type User } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { getGoogleIntegration, googleCalendarConfigured } from "@/lib/google";
import { requireAdmin } from "@/lib/session";
import { isValidEmail, listDepartmentAccess, type DepartmentAccess } from "@/lib/roster/shares";
import {
  normalizePhone,
  validateCalendarForm,
  validateUserForm,
  type CalendarFormValues,
  type UserFormValues,
  type UserStatus,
} from "@/lib/roster/validate";

export type RosterActionResult =
  { ok: true } | { ok: false; error: string; field?: "phone" | "name" | "email" };

export type ShareActionResult = { ok: true } | { ok: false; error: string };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Google Calendar request failed";
}

/** Actor columns for an audit row from the current admin session. */
function actorFrom(session: Awaited<ReturnType<typeof requireAdmin>>) {
  return actorFromUser({
    id: session.user.id,
    name: session.user.name ?? null,
    role: session.user.role,
  });
}

/** Sanitized user snapshot for audit details (never includes the password hash). */
function userSnapshot(user: User) {
  return {
    name: user.name,
    phone: user.phone,
    email: user.email,
    birthday: user.birthday,
    role: user.role,
    status: user.status,
    departmentId: user.departmentId,
  };
}

async function getCalendarOrNull(calendarId: string): Promise<Calendar | null> {
  const [row] = await db.select().from(calendars).where(eq(calendars.id, calendarId)).limit(1);
  return row ?? null;
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
  try {
    const [created] = await db
      .insert(users)
      .values({
        name: input.name.trim(),
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
        role: input.role,
        status: input.status,
        departmentId: input.departmentId,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "A user with this phone number already exists", field: "phone" };
    }
    throw error;
  }

  revalidatePath("/users");
  return { ok: true };
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

  const after = userSnapshot({
    ...before,
    name: input.name.trim(),
    phone,
    email: input.email?.trim() || null,
    birthday: input.birthday || null,
    role: input.role,
    status: input.status,
    departmentId: input.departmentId || null,
  });

  try {
    await db
      .update(users)
      .set({
        name: input.name.trim(),
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
      details: diffFields(userSnapshot(before), after),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "A user with this phone number already exists", field: "phone" };
    }
    throw error;
  }

  revalidatePath("/users");
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
    details: { status },
  });

  revalidatePath("/users");
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
  try {
    const integration = await getGoogleIntegration();
    const created = await integration.createCalendar(name);
    const [row] = await db
      .insert(calendars)
      .values({ name, googleCalendarId: created.calendarId, kind: "department" })
      .returning({ id: calendars.id, name: calendars.name });

    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.calendarCreate,
      entityType: "calendar",
      entityId: row.id,
      entityName: row.name,
      method: "createDepartment",
      details: { googleCalendarId: created.calendarId },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "A department with this Google Calendar already exists",
        field: "name",
      };
    }
    return { ok: false, error: errorMessage(error), field: "name" };
  }

  revalidatePath("/departments");
  revalidatePath("/users");
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
  try {
    if (googleCalendarConfigured()) {
      const integration = await getGoogleIntegration();
      await integration.renameCalendar(calendar.googleCalendarId, name);
    }
    await db.update(calendars).set({ name, updatedAt: new Date() }).where(eq(calendars.id, id));

    await logAction({
      ...actorFrom(session),
      action: AUDIT_ACTIONS.calendarRename,
      entityType: "calendar",
      entityId: id,
      entityName: name,
      method: "renameDepartment",
      details: diffFields({ name: calendar.name }, { name }),
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error), field: "name" };
  }

  revalidatePath("/departments");
  revalidatePath("/users");
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
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  revalidatePath("/departments");
  revalidatePath("/users");
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
): Promise<ShareActionResult> {
  const session = await requireAdmin();

  const trimmed = email.trim();
  if (!isValidEmail(trimmed)) {
    return { ok: false, error: "Enter a valid email address" };
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
    await integration.setCalendarAccess(calendar.googleCalendarId, trimmed, "reader");
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.accessGrant,
    entityType: "calendar",
    entityId: calendar.id,
    entityName: calendar.name,
    method: "grantDepartmentAccess",
    details: { email: trimmed, role: "reader" },
  });

  return { ok: true };
}

export async function revokeDepartmentAccess(
  calendarId: string,
  email: string,
): Promise<ShareActionResult> {
  const session = await requireAdmin();

  const calendar = await getCalendarOrNull(calendarId);
  if (!calendar) {
    return { ok: false, error: "Department not found" };
  }
  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  try {
    const integration = await getGoogleIntegration();
    await integration.removeCalendarAccess(calendar.googleCalendarId, email);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.accessRevoke,
    entityType: "calendar",
    entityId: calendar.id,
    entityName: calendar.name,
    method: "revokeDepartmentAccess",
    details: { email },
  });

  return { ok: true };
}
