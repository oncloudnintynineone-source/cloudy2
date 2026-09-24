import { PageTransition } from "@/components/PageTransition";
import { listEventTypes, listEventTypeGroups } from "@/lib/eventTypes/queries";
import { isReorderDragEnabled } from "@/lib/settings/featureFlags";
import { getFeatureFlag } from "@/lib/settings/queries";
import { EventTypeTable } from "./EventTypeTable";

export default async function EventTypesPage() {
  const [types, groups, reorderDrag] = await Promise.all([
    listEventTypes(),
    listEventTypeGroups(),
    getFeatureFlag("reorderDrag"),
  ]);
  return (
    <PageTransition>
      <EventTypeTable
        types={types}
        groups={groups}
        dragEnabled={isReorderDragEnabled(reorderDrag)}
      />
    </PageTransition>
  );
}
