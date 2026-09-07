import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { calendars, userCalendarAccess, users } from "@/db/schema";
import type { UserRole, UserStatus } from "@/lib/roster/validate";
import { onlyUuidIds } from "@/lib/uuid";

export interface RosterDepartment {
  id: string;
  name: string;
  sortOrder: number;
}

export interface RosterUser {
  id: string;
  name: string;
  shortname: string | null;
  phone: string;
  email: string | null;
  birthday: string | null;
  role: UserRole;
  status: UserStatus;
  department: RosterDepartment | null;
}

/** Users joined with their (single) department, sorted by name. */
export async function listUsers(): Promise<RosterUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      shortname: users.shortname,
      phone: users.phone,
      email: users.email,
      birthday: users.birthday,
      role: users.role,
      status: users.status,
      departmentId: calendars.id,
      departmentName: calendars.name,
      departmentSortOrder: calendars.sortOrder,
    })
    .from(users)
    .leftJoin(calendars, eq(calendars.id, users.departmentId))
    .orderBy(asc(users.name), asc(calendars.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shortname: row.shortname,
    phone: row.phone,
    email: row.email,
    birthday: row.birthday,
    role: row.role,
    status: row.status,
    department: row.departmentId
      ? {
          id: row.departmentId,
          name: row.departmentName ?? "",
          sortOrder: row.departmentSortOrder ?? 0,
        }
      : null,
  }));
}

export interface UserDisplayInfo {
  id: string;
  name: string;
  shortname: string | null;
  departmentName: string | null;
}

/**
 * Lightweight lookup of users by id (name, shortname, department name) for
 * rendering event title templates. Unknown ids are omitted from the result.
 */
export async function getUsersByIds(userIds: string[]): Promise<UserDisplayInfo[]> {
  const uniqueIds = [...new Set(onlyUuidIds(userIds))];
  if (uniqueIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      shortname: users.shortname,
      departmentName: calendars.name,
    })
    .from(users)
    .leftJoin(calendars, eq(calendars.id, users.departmentId))
    .where(inArray(users.id, uniqueIds));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shortname: row.shortname,
    departmentName: row.departmentName,
  }));
}

/** All departments (Google Calendar registry), ordered for display (sortOrder then name). */
export async function listDepartments() {
  return db.select().from(calendars).orderBy(asc(calendars.sortOrder), asc(calendars.name));
}

/**
 * Active roster user ids grouped by their (single) department, restricted to
 * the given department ids. Used to authorize event edits/reads by department
 * membership (an event tagged on a department is editable by every active
 * member of it). Unknown/inactive members contribute nothing.
 */
export async function activeMembershipsByDepartment(
  departmentIds: string[],
): Promise<Map<string, string[]>> {
  const uniqueIds = [...new Set(departmentIds)];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ departmentId: users.departmentId, id: users.id })
    .from(users)
    .where(
      and(eq(users.status, "active"), inArray(users.departmentId, uniqueIds)),
    );
  const memberships = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.departmentId) {
      continue;
    }
    const list = memberships.get(row.departmentId);
    if (list) {
      list.push(row.id);
    } else {
      memberships.set(row.departmentId, [row.id]);
    }
  }
  return memberships;
}

export interface RosterAccessGrant {
  calendarId: string;
  /** The granted department's display name. */
  name: string;
  role: "reader" | "writer" | "owner";
}

/**
 * Every cross-department access grant, joined with its department name and
 * ordered like the departments list. Callers group these by user id.
 */
export async function listUserAccess(): Promise<(RosterAccessGrant & { userId: string })[]> {
  const rows = await db
    .select({
      userId: userCalendarAccess.userId,
      calendarId: userCalendarAccess.calendarId,
      name: calendars.name,
      role: userCalendarAccess.role,
    })
    .from(userCalendarAccess)
    .leftJoin(calendars, eq(calendars.id, userCalendarAccess.calendarId))
    .orderBy(asc(calendars.sortOrder), asc(calendars.name));
  return rows.map((row) => ({
    userId: row.userId,
    calendarId: row.calendarId,
    name: row.name ?? row.calendarId,
    role: row.role,
  }));
}
