import { PageTransition } from "@/components/PageTransition";
import { listDepartments } from "@/lib/roster/queries";
import { DepartmentTable } from "./DepartmentTable";

export default async function DepartmentsPage() {
  const departments = await listDepartments();
  return (
    <PageTransition>
      <DepartmentTable departments={departments} />
    </PageTransition>
  );
}
