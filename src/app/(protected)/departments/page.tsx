import { requireAdmin } from "@/lib/session";
import { listDepartments } from "@/lib/roster/queries";
import { DepartmentTable } from "./DepartmentTable";

export default async function DepartmentsPage() {
  await requireAdmin();
  const departments = await listDepartments();
  return <DepartmentTable departments={departments} />;
}
