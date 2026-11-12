import { NextResponse } from "next/server";

import {
  API_NO_STORE,
  apiSession,
  isApiRequest,
  readApiJson,
  unauthorized,
} from "@/lib/api/server";
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

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: API_NO_STORE });
}

/**
 * One bounded chunk of the admin event-type reference migration (Settings →
 * Event Types → Migrate events). A route handler rather than a server action
 * so the long client-driven scan can be aborted between chunks and never
 * queues ahead of the admin's other saves. Auth is re-checked on every chunk.
 */
export async function POST(request: Request) {
  if (!isApiRequest(request)) {
    return unauthorized();
  }
  const session = await apiSession();
  if (!session) {
    return unauthorized();
  }
  if (session.user.role !== "admin") {
    return jsonError("Admins only", 403);
  }

  const body = await readApiJson<MigrationBody>(request);
  if (!body) {
    return jsonError("Invalid request body", 400);
  }
  const fromName = typeof body.fromName === "string" ? body.fromName.trim() : "";
  const toTypeId = typeof body.toTypeId === "string" ? body.toTypeId : "";
  const fromDate = typeof body.fromDate === "string" ? body.fromDate : "";
  const toDate = typeof body.toDate === "string" ? body.toDate : "";
  if (!fromName || fromName.length > 200 || !toTypeId) {
    return jsonError("Choose a source name and target event type", 400);
  }

  const rangeErrors = validateMigrationRange(fromDate, toDate);
  if (Object.keys(rangeErrors).length > 0) {
    return jsonError(rangeErrors.fromDate ?? rangeErrors.toDate ?? "Invalid range", 400);
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
    return jsonError(result.error, result.retryable ? 502 : 400);
  }
  return NextResponse.json(result, { headers: API_NO_STORE });
}
