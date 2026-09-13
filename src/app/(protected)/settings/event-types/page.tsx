import { PageTransition } from "@/components/PageTransition";
import { listEventTypes, listEventTypeGroups } from "@/lib/eventTypes/queries";
import { EventTypeTable } from "./EventTypeTable";

export default async function EventTypesPage() {
  const [types, groups] = await Promise.all([listEventTypes(), listEventTypeGroups()]);
  return (
    <PageTransition>
      <EventTypeTable types={types} groups={groups} />
    </PageTransition>
  );
}
