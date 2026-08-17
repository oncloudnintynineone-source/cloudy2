import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { calendars, users } from "@/db/schema";
import type { UserRole, UserStatus } from "@/lib/roster/validate";

export interface RosterDepartment {
  id: string;
  name: string;
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
    department: row.departmentId ? { id: row.departmentId, name: row.departmentName ?? "" } : null,
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
  const uniqueIds = [...new Set(userIds)];
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

/** All departments (Google Calendar registry), ordered by name. */
export async function listDepartments() {
  return db.select().from(calendars).orderBy(asc(calendars.name));
}
