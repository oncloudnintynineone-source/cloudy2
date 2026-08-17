import { listDepartments, listUsers } from "@/lib/roster/queries";
import { getSettings } from "@/lib/settings/queries";
import { UserTable } from "./UserTable";

export default async function UsersPage() {
  const [users, departments, settings] = await Promise.all([
    listUsers(),
    listDepartments(),
    getSettings(),
  ]);
  return (
    <UserTable
      users={users}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      nameTemplate={settings.nameTemplate}
    />
  );
}
