import { listUsers } from "@/lib/roster/queries";
import {
  listAuditActors,
  listAuditEntityTypes,
  listAuditLogs,
  parseAuditFilters,
} from "@/lib/audit/queries";
import { getSettings } from "@/lib/settings/queries";
import { AuditLogView } from "./AuditLogView";

interface AuditLogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const params = await searchParams;
  const filters = parseAuditFilters(params);

  const [settings, actors, entityTypes, roster] = await Promise.all([
    getSettings(),
    listAuditActors(),
    listAuditEntityTypes(),
    listUsers(),
  ]);

  const logPage = await listAuditLogs(filters, { retentionDays: settings.auditLogRetentionDays });

  // Actor filter values are name snapshots (they survive user deletion), so the
  // picker needs a department for each distinct actor name. Names still present
  // in the log come from the DB; names that appear only in the applied filter
  // (purged from the log) are unioned in so their picker labels still render.
  // Unmatched names ("Admin", deleted users) map to null → "Other" section.
  const departmentByUser = new Map(roster.map((user) => [user.name, user.department]));
  const actorNames = [...new Set([...actors, ...filters.actor])].sort((a, b) => a.localeCompare(b));
  const actorDepartments: Record<
    string,
    { department: string | null; departmentSort: number | null }
  > = Object.fromEntries(
    actorNames.map((name) => {
      const department = departmentByUser.get(name) ?? null;
      return [
        name,
        { department: department?.name ?? null, departmentSort: department?.sortOrder ?? null },
      ];
    }),
  );

  return (
    <AuditLogView
      initialRows={logPage.rows}
      nextCursor={logPage.nextCursor}
      filters={filters}
      actors={actorNames}
      actorDepartments={actorDepartments}
      entityTypes={entityTypes}
      retentionDays={settings.auditLogRetentionDays}
    />
  );
}
