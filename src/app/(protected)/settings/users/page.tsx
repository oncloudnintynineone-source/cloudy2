import {
  listDepartments,
  listUserAccess,
  listUsers,
  type RosterAccessGrant,
} from "@/lib/roster/queries";
import { getSettings } from "@/lib/settings/queries";
import { UserTable } from "./UserTable";

export default async function UsersPage() {
  const [users, departments, accessRows, settings] = await Promise.all([
    listUsers(),
    listDepartments(),
    listUserAccess(),
    getSettings(),
  ]);

  // Group every cross-department grant by user id, so the edit form for a user
  // can seed its "Department access" section from one lookup.
  const accessByUser: Record<string, RosterAccessGrant[]> = {};
  for (const row of accessRows) {
    (accessByUser[row.userId] ??= []).push({
      calendarId: row.calendarId,
      name: row.name ?? row.calendarId,
      role: row.role,
    });
  }

  return (
    <UserTable
      users={users}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      accessByUser={accessByUser}
      nameTemplate={settings.nameTemplate}
    />
  );
}
