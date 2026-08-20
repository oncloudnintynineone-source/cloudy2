import { NextRequest, NextResponse } from "next/server";

import { auditCsvFilename, buildAuditLogCsv } from "@/lib/audit/export";
import { listAuditLogs, parseAuditFilters } from "@/lib/audit/queries";
import { requireAdmin } from "@/lib/session";

/** Cap on exported rows so a single request never dumps unbounded data. */
const EXPORT_MAX_ROWS = 10_000;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const filters = parseAuditFilters(Object.fromEntries(request.nextUrl.searchParams));

  // Fetch pages of the fully-filtered log (newest first) until the cap.
  const rows = [];
  let cursor = filters.cursor;
  while (rows.length < EXPORT_MAX_ROWS) {
    const page = await listAuditLogs(
      { ...filters, cursor },
      { pageSize: Math.min(500, EXPORT_MAX_ROWS - rows.length), retentionDays: null },
    );
    rows.push(...page.rows);
    cursor = page.nextCursor;
    if (!cursor) {
      break;
    }
  }

  const csv = buildAuditLogCsv(rows.slice(0, EXPORT_MAX_ROWS));

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${auditCsvFilename()}"`,
      "Cache-Control": "no-store",
    },
  });
}
