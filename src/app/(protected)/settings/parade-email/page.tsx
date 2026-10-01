import { PageTransition } from "@/components/PageTransition";
import { listCalendars } from "@/lib/events/queries";
import { listUsers } from "@/lib/roster/queries";
import { requireSession } from "@/lib/session";
import { getSettings } from "@/lib/settings/queries";
import type { UserGroupInput } from "@/lib/users/userSelect";

import { ParadeEmailForm } from "./ParadeEmailForm";

export default async function ParadeEmailPage() {
  const session = await requireSession();
  const [users, calendars, settings] = await Promise.all([
    listUsers(),
    listCalendars(),
    getSettings(),
  ]);

  const departmentParentById = new Map(
    calendars.map((calendar) => [calendar.id, calendar.parentId ?? null]),
  );

  const pickerUsers: UserGroupInput[] = users
    .filter((user) => user.status === "active")
    .map((user) => ({
      id: user.id,
      label: user.name,
      search:
        [user.shortname, user.email, user.department?.name].filter(Boolean).join(" ") || undefined,
      department: user.department?.name ?? null,
      departmentSort: user.department?.sortOrder ?? null,
      departmentId: user.department?.id ?? null,
      departmentParentId: user.department?.id
        ? (departmentParentById.get(user.department.id) ?? null)
        : null,
    }));

  return (
    <PageTransition>
      <ParadeEmailForm
        pickerUsers={pickerUsers}
        currentUserId={session.user.id}
        initial={{
          enabled: settings.paradeEmailEnabled,
          recipientIds: settings.paradeEmailRecipientIds,
          sendTime: settings.paradeEmailSendTime,
          days: settings.paradeEmailDays,
          subjectTemplate: settings.paradeEmailSubjectTemplate,
          bodyTemplate: settings.paradeEmailBodyTemplate,
        }}
      />
    </PageTransition>
  );
}
