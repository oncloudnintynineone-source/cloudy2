import { PageTransition } from "@/components/PageTransition";
import { listEventTypes, listEventTypeGroups } from "@/lib/eventTypes/queries";
import { LOCKED_VARIANTS } from "@/lib/settings/featureFlags";
import { EventTypeTable } from "./EventTypeTable";

export default async function EventTypesPage() {
  const [types, groups] = await Promise.all([listEventTypes(), listEventTypeGroups()]);
  return (
    <PageTransition>
      <EventTypeTable
        types={types}
        groups={groups}
        reorderDrag={LOCKED_VARIANTS.reorderDrag}
      />
    </PageTransition>
  );
}
