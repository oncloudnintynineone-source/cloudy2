import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { departments, userDepartments, users } from "@/db/schema";
import type { UserRole, UserStatus } from "@/lib/roster/validate";

export interface RosterDepartment {
  id: string;
  name: string;
  isPrimary: boolean;
}

export interface RosterUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  birthday: string | null;
  role: UserRole;
  status: UserStatus;
  departments: RosterDepartment[];
}

/** Users joined with their department memberships, sorted by name. */
export async function listUsers(): Promise<RosterUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      email: users.email,
      birthday: users.birthday,
      role: users.role,
      status: users.status,
      departmentId: userDepartments.departmentId,
      departmentName: departments.name,
      isPrimary: userDepartments.isPrimary,
    })
    .from(users)
    .leftJoin(userDepartments, eq(userDepartments.userId, users.id))
    .leftJoin(departments, eq(departments.id, userDepartments.departmentId))
    .orderBy(asc(users.name), asc(departments.name));

  const byId = new Map<string, RosterUser>();
  for (const row of rows) {
    let user = byId.get(row.id);
    if (!user) {
      user = {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        birthday: row.birthday,
        role: row.role,
        status: row.status,
        departments: [],
      };
      byId.set(row.id, user);
    }
    if (row.departmentId) {
      user.departments.push({
        id: row.departmentId,
        name: row.departmentName ?? "",
        isPrimary: row.isPrimary ?? false,
      });
    }
  }

  return [...byId.values()];
}

/** All departments ordered by sortOrder then name. */
export async function listDepartments() {
  return db.select().from(departments).orderBy(asc(departments.sortOrder), asc(departments.name));
}
