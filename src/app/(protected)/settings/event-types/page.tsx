import { listEventTypes } from "@/lib/eventTypes/queries";
import { EventTypeTable } from "./EventTypeTable";

export default async function EventTypesPage() {
  const types = await listEventTypes();
  return <EventTypeTable types={types} />;
}
