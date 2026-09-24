import { PageTransition } from "@/components/PageTransition";
import { listDepartments } from "@/lib/roster/queries";
import { isReorderDragEnabled } from "@/lib/settings/featureFlags";
import { getFeatureFlag } from "@/lib/settings/queries";
import { DepartmentTable } from "./DepartmentTable";

export default async function DepartmentsPage() {
  const [departments, reorderDrag] = await Promise.all([
    listDepartments(),
    getFeatureFlag("reorderDrag"),
  ]);
  return (
    <PageTransition>
      <DepartmentTable departments={departments} dragEnabled={isReorderDragEnabled(reorderDrag)} />
    </PageTransition>
  );
}
