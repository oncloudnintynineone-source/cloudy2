import { listKahGroupsWithMembers } from "@/lib/kah/queries";
import { listUsers } from "@/lib/roster/queries";
import { getSettings } from "@/lib/settings/queries";
import type { UserGroupInput } from "@/lib/users/userSelect";

import { KahGroupTable } from "./KahGroupTable";

export default async function KahGroupsPage() {
  const [groups, users, settings] = await Promise.all([
    listKahGroupsWithMembers(),
    listUsers(),
    getSettings(),
  ]);

  const pickerUsers: UserGroupInput[] = users
    .filter((user) => user.status === "active")
    .map((user) => ({
      id: user.id,
      label: user.name,
      search: [user.shortname, user.department?.name].filter(Boolean).join(" ") || undefined,
      department: user.department?.name ?? null,
    }));

  return (
    <KahGroupTable
      groups={groups}
      pickerUsers={pickerUsers}
      defaultPercentage={settings.kahDefaultPercentage}
      kahEmailSubjectTemplate={settings.kahEmailSubjectTemplate}
      kahEmailBodyTemplate={settings.kahEmailBodyTemplate}
    />
  );
}
