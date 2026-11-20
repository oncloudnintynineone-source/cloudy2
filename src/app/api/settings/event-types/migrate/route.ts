import { apiError, apiJson, readApiJson, withApiSession } from "@/lib/api/server";
import { validateMigrationRange } from "@/lib/eventTypes/migration";
import { runMigrationChunk } from "@/lib/eventTypes/migrationRun";
import type { MigrationCursor } from "@/lib/eventTypes/migration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** A chunk is bounded, but a cold Google page can still take a few seconds. */
export const maxDuration = 60;

interface MigrationBody {
  fromName?: unknown;
  toTypeId?: unknown;
  fromDate?: unknown;
  toDate?: unknown;
  updateTitles?: unknown;
  cursor?: unknown;
}

export async function POST(request: Request) {
  const auth = await withApiSession(request, { requireApiHeader: true, admin: true });
  if (!auth.ok) {
    return auth.response;
  }

  const body = await readApiJson<MigrationBody>(request);
  if (!body) {
    return apiError(400, "Invalid request body");
  }
  const fromName = typeof body.fromName === "string" ? body.fromName.trim() : "";
  const toTypeId = typeof body.toTypeId === "string" ? body.toTypeId : "";
  const fromDate = typeof body.fromDate === "string" ? body.fromDate : "";
  const toDate = typeof body.toDate === "string" ? body.toDate : "";
  if (!fromName || fromName.length > 200 || !toTypeId) {
    return apiError(400, "Choose a source name and target event type");
  }

  const rangeErrors = validateMigrationRange(fromDate, toDate);
  if (Object.keys(rangeErrors).length > 0) {
    return apiError(400, rangeErrors.fromDate ?? rangeErrors.toDate ?? "Invalid range");
  }

  const result = await runMigrationChunk({
    fromName,
    toTypeId,
    fromDate,
    toDate,
    updateTitles: body.updateTitles === true,
    cursor: (body.cursor ?? null) as MigrationCursor | null,
  });

  if (!result.ok) {
    return apiError(result.retryable ? 502 : 400, result.error);
  }
  return apiJson(result);
}
