"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { userDashboardViews } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/session";
import { isDateOnly, replaceTypeNameInFilters } from "@/lib/eventTypes/migration";

interface MigrationFinalizeInput {
  fromName: string;
  toName: string;
  toTypeId?: string | null;
  fromDate: string;
  toDate: string;
  updateTitles: boolean;
  eventsScanned: number;
  eventsUpdated: number;
  failed: number;
  cancelled: boolean;
}

type MigrationFinalizeResult = { ok: true } | { ok: false; error: string };

function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * Record a finished/aborted migration and rewrite the saved dashboard tab
 * filters that still name the old type. Kept separate from the chunk route so
 * the counts are the client's accumulated totals for the whole run.
 */
export async function finalizeEventTypeMigration(
  input: MigrationFinalizeInput,
): Promise<MigrationFinalizeResult> {
  const session = await requireAdmin();
  const fromName = input.fromName?.trim() ?? "";
  const toName = input.toName?.trim() ?? "";
  if (!fromName || !toName) {
    return { ok: false, error: "Event type names are required" };
  }
  if (!isDateOnly(input.fromDate) || !isDateOnly(input.toDate) || input.fromDate > input.toDate) {
    return { ok: false, error: "Invalid migration range" };
  }

  if (!input.cancelled && fromName !== toName) {
    const rows = await db
      .select({ id: userDashboardViews.id, typesFilter: userDashboardViews.typesFilter })
      .from(userDashboardViews);
    for (const row of rows) {
      const next = replaceTypeNameInFilters(row.typesFilter, fromName, toName);
      if (next !== null && JSON.stringify(next) !== JSON.stringify(row.typesFilter)) {
        await db
          .update(userDashboardViews)
          .set({ typesFilter: next, updatedAt: new Date() })
          .where(eq(userDashboardViews.id, row.id));
      }
    }
  }

  await logAction({
    ...actorFromUser({
      id: session.user.id,
      name: session.user.name ?? null,
      role: session.user.role,
    }),
    action: AUDIT_ACTIONS.eventTypeMigrate,
    entityType: "eventType",
    entityId: input.toTypeId ?? null,
    entityName: toName,
    method: "migrateEventTypeReferences",
    details: {
      from: fromName,
      to: toName,
      rangeFrom: input.fromDate,
      rangeTo: input.toDate,
      updateTitles: input.updateTitles === true,
      eventsScanned: count(input.eventsScanned),
      eventsUpdated: count(input.eventsUpdated),
      failed: count(input.failed),
      cancelled: input.cancelled === true,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/settings/event-types");
  return { ok: true };
}
