import { PageTransition } from "@/components/PageTransition";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { listUsers } from "@/lib/roster/queries";
import { isReorderDragEnabled } from "@/lib/settings/featureFlags";
import { getSettings, listEventTitleTemplates } from "@/lib/settings/queries";
import { TemplatesManager } from "./TemplatesManager";

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
    <PageTransition>
      <TemplatesManager
        nameTemplate={settings.nameTemplate}
        eventTitleRecipe={settings.eventTitleRecipe}
        templates={templates.map((t) => ({ id: t.id, label: t.label, recipe: t.recipe }))}
        assignments={settings.eventTitleTemplateAssignments as Record<string, string>}
        dragEnabled={isReorderDragEnabled(settings.featureFlags.reorderDrag)}
        previewUsers={previewUsers}
        previewEventTypes={eventTypes.map((type) => ({
          name: type.name,
          shortname: type.shortname,
        }))}
      />
    </PageTransition>
  );
}
