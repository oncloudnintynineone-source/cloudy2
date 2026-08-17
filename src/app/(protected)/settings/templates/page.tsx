import { listEventTypes } from "@/lib/eventTypes/queries";
import { listUsers } from "@/lib/roster/queries";
import { getSettings } from "@/lib/settings/queries";
import { TemplatesForm } from "./TemplatesForm";

export default async function TemplatesPage() {
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
    <TemplatesForm
      nameTemplate={settings.nameTemplate}
      eventTitleTemplate={settings.eventTitleTemplate}
      previewUsers={previewUsers}
      previewEventTypes={eventTypes.map((type) => ({
        name: type.name,
        shortname: type.shortname,
      }))}
    />
  );
}
