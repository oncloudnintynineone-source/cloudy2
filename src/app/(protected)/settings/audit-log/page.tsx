import { listAuditActors, listAuditEntityTypes, listAuditLogs, parseAuditFilters } from "@/lib/audit/queries";
import { getSettings } from "@/lib/settings/queries";
import { AuditLogView } from "./AuditLogView";

interface AuditLogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const params = await searchParams;
  const filters = parseAuditFilters(params);

  const [settings, actors, entityTypes] = await Promise.all([
    getSettings(),
    listAuditActors(),
    listAuditEntityTypes(),
  ]);

  const logPage = await listAuditLogs(filters, { retentionDays: settings.auditLogRetentionDays });

  return (
    <AuditLogView
      initialRows={logPage.rows}
      nextCursor={logPage.nextCursor}
      filters={filters}
      actors={actors}
      entityTypes={entityTypes}
      retentionDays={settings.auditLogRetentionDays}
    />
  );
}
