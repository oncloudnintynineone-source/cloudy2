import { PageTransition } from "@/components/PageTransition";
import { listDepartments } from "@/lib/roster/queries";
import { LOCKED_VARIANTS } from "@/lib/settings/featureFlags";
import { DepartmentTable } from "./DepartmentTable";

export default async function DepartmentsPage() {
  const departments = await listDepartments();
  return (
    <PageTransition>
      <DepartmentTable departments={departments} reorderDrag={LOCKED_VARIANTS.reorderDrag} />
    </PageTransition>
  );
}
