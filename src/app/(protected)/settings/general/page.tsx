import { listEventTypes } from "@/lib/eventTypes/queries";
import { listUsers } from "@/lib/roster/queries";
import { getSettings } from "@/lib/settings/queries";
import { SettingsForm } from "./SettingsForm";

export default async function GeneralPage() {
  const [settings, users, eventTypes] = await Promise.all([
    getSettings(),
    listUsers(),
    listEventTypes(),
  ]);
  const previewUsers = users.slice(0, 5).map((user) => ({
    name: user.name,
    shortname: user.shortname,
    departmentName: user.department?.name ?? null,
  }));
  return (
    <SettingsForm
      keyword={settings.userKeyword}
      nameTemplate={settings.nameTemplate}
      eventTitleTemplate={settings.eventTitleTemplate}
      previewUsers={previewUsers}
      previewEventTypes={eventTypes.map((type) => type.name)}
    />
  );
}
