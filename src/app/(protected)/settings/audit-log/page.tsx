import { PageTransition } from "@/components/PageTransition";
import { listCalendars } from "@/lib/events/queries";
import { listUsers } from "@/lib/roster/queries";
import {
  AUDIT_PAGE_SIZE,
  countAuditLogs,
  listAuditActors,
  listAuditEntityTypes,
  listAuditLogs,
  parseAuditFilters,
  purgeExpiredAuditLogs,
} from "@/lib/audit/queries";
import { getSettings } from "@/lib/settings/queries";
import { AuditLogView } from "./AuditLogView";

interface AuditLogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const params = await searchParams;
  const filters = parseAuditFilters(params);

  const [settings, actors, entityTypes, roster, calendars] = await Promise.all([
    getSettings(),
    listAuditActors(),
    listAuditEntityTypes(),
    listUsers(),
    listCalendars(),
  ]);

  const departmentParentById = new Map(
    calendars.map((calendar) => [calendar.id, calendar.parentId ?? null]),
  );

  // Rotation-on-read fires here (before the count, so the total reflects the
  // purged set). Offset pagination then fetches exactly the requested page.
  if (settings.auditLogRetentionDays > 0) {
    await purgeExpiredAuditLogs(settings.auditLogRetentionDays);
  }

  const total = await countAuditLogs(filters);
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(filters.page, 1), pageCount);
  const offset = (page - 1) * AUDIT_PAGE_SIZE;
  const logPage = await listAuditLogs(filters, { offset });

  // Actor filter values are name snapshots (they survive user deletion), so the
  // picker needs a department for each distinct actor name. Names still present
  // in the log come from the DB; names that appear only in the applied filter
  // (purged from the log) are unioned in so their picker labels still render.
  // Unmatched names ("Admin", deleted users) map to null → "Other" section.
  const departmentByUser = new Map(roster.map((user) => [user.name, user.department]));
  const actorNames = [...new Set([...actors, ...filters.actor])].sort((a, b) => a.localeCompare(b));
  const actorDepartments: Record<
    string,
    {
      department: string | null;
      departmentSort: number | null;
      departmentId: string | null;
      departmentParentId: string | null;
    }
  > = Object.fromEntries(
    actorNames.map((name) => {
      const department = departmentByUser.get(name) ?? null;
      return [
        name,
        {
          department: department?.name ?? null,
          departmentSort: department?.sortOrder ?? null,
          departmentId: department?.id ?? null,
          departmentParentId: department?.id
            ? (departmentParentById.get(department.id) ?? null)
            : null,
        },
      ];
    }),
  );

  // Stamped into the payload so the client can tell a live render from a
  // cache replay and force one fresh read when needed (`useLiveRouteRefresh`).
  // Request-scoped and stable for this render; the purity rule cannot tell a
  // Server Component from a client one.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();

  return (
    <PageTransition>
      <AuditLogView
        initialRows={logPage.rows}
        page={page}
        pageCount={pageCount}
        total={total}
        filters={filters}
        actors={actorNames}
        actorDepartments={actorDepartments}
        entityTypes={entityTypes}
        retentionDays={settings.auditLogRetentionDays}
        renderedAt={renderedAt}
      />
    </PageTransition>
  );
}
