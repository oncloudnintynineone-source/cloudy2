import { Stack } from "@mantine/core";

import { listEventTypes } from "@/lib/eventTypes/queries";
import { listUsers } from "@/lib/roster/queries";
import { getSettings, listEventTitleTemplates } from "@/lib/settings/queries";
import { TemplatesForm } from "./TemplatesForm";
import { NotificationTemplatesEditor } from "./NotificationTemplatesEditor";

export default async function TemplatesPage() {
  const [settings, users, eventTypes, templates] = await Promise.all([
    getSettings(),
    listUsers(),
    listEventTypes(),
    listEventTitleTemplates(),
  ]);
  const previewUsers = users.slice(0, 5).map((user) => ({
    name: user.name,
    shortname: user.shortname,
    departmentName: user.department?.name ?? null,
  }));
  return (
    <Stack gap="md">
      <TemplatesForm
        nameTemplate={settings.nameTemplate}
        eventTitleRecipe={settings.eventTitleRecipe}
        templates={templates.map((t) => ({ id: t.id, label: t.label, recipe: t.recipe }))}
        assignments={settings.eventTitleTemplateAssignments as Record<string, string>}
        previewUsers={previewUsers}
        previewEventTypes={eventTypes.map((type) => ({
          name: type.name,
          shortname: type.shortname,
        }))}
      />
      <NotificationTemplatesEditor initial={settings.participantNotifyTemplates} />
    </Stack>
  );
}
