import { PageTransition } from "@/components/PageTransition";
import { listDepartments } from "@/lib/roster/queries";
import { reorderDragFlag, resolveFlagValue } from "@/lib/settings/featureFlags";
import { getFeatureFlag } from "@/lib/settings/queries";
import { DepartmentTable } from "./DepartmentTable";

export default async function DepartmentsPage() {
  const [departments, reorderDrag] = await Promise.all([
    listDepartments(),
    getFeatureFlag("reorderDrag"),
  ]);
  return (
    <PageTransition>
      <DepartmentTable
        departments={departments}
        reorderDrag={resolveFlagValue(reorderDragFlag, reorderDrag)}
      />
    </PageTransition>
  );
}
