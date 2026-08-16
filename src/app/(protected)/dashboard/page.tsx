import { listEventTypes } from "@/lib/eventTypes/queries";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { fetchMonthEvents, getUserDepartmentId, listCalendars } from "@/lib/events/queries";
import { googleCalendarConfigured } from "@/lib/google";
import { requireSession } from "@/lib/session";
import { DashboardView } from "./DashboardView";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function currentMonth(): string {
  return formatInstantToNaive(new Date()).slice(0, 7);
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const isAdmin = session.user.role === "admin";

  const month = typeof params.month === "string" && MONTH_PATTERN.test(params.month)
    ? params.month
    : currentMonth();

  const view = params.view === "mobile" ? "mobile" : "month";

  const [calendars, eventTypes] = await Promise.all([listCalendars(), listEventTypes()]);
  const calendarIds = calendars.map((calendar) => calendar.id);

  const ownDepartmentId = isAdmin ? null : await getUserDepartmentId(session.user.id);
  const defaultCalendars = isAdmin
    ? calendarIds
    : ownDepartmentId
      ? [ownDepartmentId]
      : [];

  const calParam = typeof params.cal === "string" ? params.cal.split(",").filter(Boolean) : [];
  const selectedCalendars =
    params.cal === undefined
      ? defaultCalendars
      : calParam.filter((id) => calendarIds.includes(id));

  const typeNames = eventTypes.map((type) => type.name);
  const typesParam =
    typeof params.types === "string" ? params.types.split(",").filter(Boolean) : [];
  const selectedTypes =
    params.types === undefined
      ? []
      : typesParam.filter((name) => typeNames.includes(name));

  const events = await fetchMonthEvents({
    month,
    calendarIds: selectedCalendars,
    typeFilter: selectedTypes,
  });

  return (
    <DashboardView
      month={month}
      view={view}
      events={events}
      calendars={calendars.map((calendar) => ({ id: calendar.id, name: calendar.name }))}
      eventTypes={typeNames}
      isAdmin={isAdmin}
      googleConfigured={googleCalendarConfigured()}
      selectedCalendarIds={selectedCalendars}
      selectedTypes={selectedTypes}
      initialCalendarId={isAdmin ? (calendarIds[0] ?? "") : (ownDepartmentId ?? "")}
    />
  );
}
