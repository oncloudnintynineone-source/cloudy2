import { listDepartments, listUsers } from "@/lib/roster/queries";
import { UserTable } from "./UserTable";

export default async function UsersPage() {
  const [users, departments] = await Promise.all([listUsers(), listDepartments()]);
  return (
    <UserTable
      users={users}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
