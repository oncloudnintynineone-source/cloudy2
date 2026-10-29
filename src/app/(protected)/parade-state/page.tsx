import { PageContainer } from "@/components/PageContainer";
import { PageTransition } from "@/components/PageTransition";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { displayTitleOptions, resolveDisplayTitles } from "@/lib/events/eventTitleDisplay";
import { fetchMonthEvents, listCalendars } from "@/lib/events/queries";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { filterUserOptionIds } from "@/lib/filters/filterUserOptions";
import { listUsers } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings, listEventTitleTemplates } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import { getUserPreferences } from "@/lib/userPrefs/queries";
import { ParadeStateView } from "./ParadeStateView";
import { scopeParadeUsers } from "./scopeUsers";

interface ParadeStatePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return formatInstantToNaive(new Date()).slice(0, 10);
}

export default async function ParadeStatePage({ searchParams }: ParadeStatePageProps) {
  const session = await requireSession();
  const params = await searchParams;

  // The Parade Calendars/Users filters are stored server-side per account
  // (src/lib/userPrefs) so they follow the user across devices. The day is
  // deliberately NOT remembered (unlike the dashboard): a bare /parade-state
  // always opens on today; only an explicit ?date= wins.
  const prefs = await getUserPreferences(session.user.id);

  const urlDate =
    typeof params.date === "string" && DATE_PATTERN.test(params.date) ? params.date : null;
  const dateParam = urlDate ?? today();
  const month = dateParam.slice(0, 7);

  const [calendars, allUsers, settings, eventTypes, titleTemplates] = await Promise.all([
    listCalendars(),
    listUsers(),
    getSettings(),
    listEventTypes(),
    listEventTitleTemplates(),
  ]);

  const calendarIds = calendars.map((calendar) => calendar.id);
  const departmentParentById = new Map(
    calendars.map((calendar) => [calendar.id, calendar.parentId ?? null]),
  );

  // Every role opens on every department; narrowing is purely opt-in via the
  // Calendars filter (an empty remembered list = all departments).
  const rememberedCal = prefs?.paradeCal ?? [];
  const selectedCalendars =
    rememberedCal.length > 0 ? rememberedCal.filter((id) => calendarIds.includes(id)) : calendarIds;

  const allUserIds = allUsers.map((user) => user.id);
  const selectedUsers = (prefs?.paradeUsers ?? []).filter((id) => allUserIds.includes(id));

  const activeUsers = allUsers.filter((user) => user.status === "active");

  // Department-tagged events mark every active member of that department out
  // of camp. Built from the roster already loaded (no extra query); also feeds
  // the month read's user filter so department-only events survive it.
  const memberships = new Map<string, string[]>();
  for (const user of activeUsers) {
    if (!user.department) continue;
    const list = memberships.get(user.department.id);
    if (list) {
      list.push(user.id);
    } else {
      memberships.set(user.department.id, [user.id]);
    }
  }
  const departmentMemberships: Record<string, string[]> = Object.fromEntries(memberships);

  const events = await fetchMonthEvents({
    month,
    calendarIds: selectedCalendars,
    typeFilter: [],
    userFilter: selectedUsers,
    memberships,
  });

  // The Parade State event labels honour the admin's title-template engine:
  // the `paradeState` assignment target when set, else Master. Resolving here
  // (rather than in the client view) keeps the roster, the per-user agenda and
  // the detail modal on one rendered title, matching the dashboard.
  const displayEvents = resolveDisplayTitles(
    events,
    displayTitleOptions("paradeState", {
      nameTemplate: settings.nameTemplate,
      masterRecipe: settings.eventTitleRecipe,
      assignments: settings.eventTitleTemplateAssignments as Record<string, string>,
      templates: titleTemplates.map(({ id, label, recipe }) => ({ id, label, recipe })),
      usersById: new Map(
        allUsers.map((user) => [
          user.id,
          {
            id: user.id,
            name: user.name,
            shortname: user.shortname,
            departmentName: user.department?.name ?? null,
          },
        ]),
      ),
      eventTypesByName: new Map(
        eventTypes.map((type) => [type.name, { name: type.name, shortname: type.shortname }]),
      ),
      calendarsById: new Map(calendars.map((calendar) => [calendar.id, calendar.name])),
    }),
  );

  const peopleNames = Object.fromEntries(
    allUsers.map((user) => [
      user.id,
      formatFullName(
        { name: user.name, departmentName: user.department?.name ?? null },
        settings.nameTemplate,
      ),
    ]),
  );
  const currentUserDepartment = allUsers.find((user) => user.id === session.user.id)?.department;
  const myActiveDepartmentIds = currentUserDepartment ? [currentUserDepartment.id] : [];

  const visibleUsers = scopeParadeUsers(activeUsers, calendarIds, selectedCalendars, selectedUsers);

  // Filter-dialog user options: the users in the current calendar scope (no
  // user narrowing, so the Users filter can be changed) plus the current user.
  const scopedRowUsers = scopeParadeUsers(activeUsers, calendarIds, selectedCalendars, []);
  const filterUserIds = filterUserOptionIds({
    users: allUsers,
    rowUserIds: scopedRowUsers.map((user) => user.id),
    currentUserId: session.user.id,
  });
  const filterUsers = allUsers
    .filter((user) => filterUserIds.includes(user.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
      displayName: formatFullName(
        { name: user.name, departmentName: user.department?.name ?? null },
        settings.nameTemplate,
      ),
      departmentName: user.department?.name ?? null,
      departmentSort: user.department?.sortOrder ?? null,
      departmentId: user.department?.id ?? null,
      departmentParentId: user.department?.id
        ? (departmentParentById.get(user.department.id) ?? null)
        : null,
    }));

  return (
    <PageTransition>
      <PageContainer>
        <ParadeStateView
          date={dateParam}
          month={month}
          users={visibleUsers.map((user) => ({
            id: user.id,
            name: user.name,
            shortname: user.shortname,
            department: user.department
              ? {
                  id: user.department.id,
                  name: user.department.name,
                  sortOrder: user.department.sortOrder,
                }
              : null,
          }))}
          events={displayEvents}
          calendars={calendars.map((calendar) => ({
            id: calendar.id,
            name: calendar.name,
            sortOrder: calendar.sortOrder,
            parentId: calendar.parentId,
          }))}
          currentUser={session.user.id}
          selectedCalendarIds={selectedCalendars}
          selectedUserIds={selectedUsers}
          departmentMemberships={departmentMemberships}
          filterUsers={filterUsers}
          nameTemplate={settings.nameTemplate}
          peopleNames={peopleNames}
          myActiveDepartmentIds={myActiveDepartmentIds}
          isAdmin={session.user.role === "admin"}
          weekStartsOn={prefs?.weekStart ?? "monday"}
        />
      </PageContainer>
    </PageTransition>
  );
}
