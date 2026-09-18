"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { quickLinks, type QuickLink } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { invalidateConfigCache } from "@/lib/configCache";
import { requireAdmin } from "@/lib/session";
import { listQuickLinks } from "./queries";
import { normalizeQuickLinkForm } from "./validate";
import type { QuickLinkFormValues } from "./validate";
import { formatQuickLinkIconLabel } from "./icons";

export type QuickLinkActionResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      field?: "label" | "url";
    };

function actorFrom(session: Awaited<ReturnType<typeof requireAdmin>>) {
  return actorFromUser({
    id: session.user.id,
    name: session.user.name ?? null,
    role: session.user.role,
  });
}

async function getQuickLinkOrNull(id: string): Promise<QuickLink | null> {
  const [row] = await db.select().from(quickLinks).where(eq(quickLinks.id, id)).limit(1);
  return row ?? null;
}

/** Audit values with display names instead of raw icon/color keys. */
function auditValues(values: {
  label: string;
  url: string;
  icon: string;
  color: string | null;
  enabled: boolean;
}) {
  return {
    label: values.label,
    url: values.url,
    icon: formatQuickLinkIconLabel(values.icon),
    color: values.color
      ? values.color.charAt(0).toUpperCase() + values.color.slice(1)
      : "Auto",
    enabled: values.enabled,
  };
}

function revalidateQuickLinks(): void {
  invalidateConfigCache(["quickLinks"]);
  revalidatePath("/settings/quick-links");
  revalidatePath("/dashboard");
}

export async function createQuickLink(
  input: QuickLinkFormValues,
): Promise<QuickLinkActionResult> {
  const session = await requireAdmin();

  const normalized = normalizeQuickLinkForm(input);
  if (!normalized.ok || !normalized.values) {
    return {
      ok: false,
      error: normalized.error ?? "Check the highlighted fields",
      field: normalized.field,
    };
  }

  const rows = await listQuickLinks();
  const nextOrder = rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

  const [created] = await db
    .insert(quickLinks)
    .values({
      ...normalized.values,
      enabled: input.enabled,
      sortOrder: nextOrder,
    })
    .returning({ id: quickLinks.id });

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.quickLinkCreate,
    entityType: "quickLink",
    entityId: created.id,
    entityName: normalized.values.label,
    method: "createQuickLink",
    details: auditValues({ ...normalized.values, enabled: input.enabled }),
  });

  revalidateQuickLinks();
  return { ok: true };
}

export async function updateQuickLink(
  id: string,
  input: QuickLinkFormValues,
): Promise<QuickLinkActionResult> {
  const session = await requireAdmin();

  const normalized = normalizeQuickLinkForm(input);
  if (!normalized.ok || !normalized.values) {
    return {
      ok: false,
      error: normalized.error ?? "Check the highlighted fields",
      field: normalized.field,
    };
  }

  const existing = await getQuickLinkOrNull(id);
  if (!existing) {
    return { ok: false, error: "Quick link not found" };
  }

  await db
    .update(quickLinks)
    .set({ ...normalized.values, enabled: input.enabled, updatedAt: new Date() })
    .where(eq(quickLinks.id, id));

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.quickLinkUpdate,
    entityType: "quickLink",
    entityId: id,
    entityName: normalized.values.label,
    method: "updateQuickLink",
    details: diffFields(
      auditValues({
        label: existing.label,
        url: existing.url,
        icon: existing.icon,
        color: existing.color,
        enabled: existing.enabled,
      }),
      auditValues({ ...normalized.values, enabled: input.enabled }),
    ),
  });

  revalidateQuickLinks();
  return { ok: true };
}

export async function deleteQuickLink(id: string): Promise<QuickLinkActionResult> {
  const session = await requireAdmin();

  const existing = await getQuickLinkOrNull(id);
  if (!existing) {
    return { ok: true };
  }

  await db.delete(quickLinks).where(eq(quickLinks.id, id));

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.quickLinkDelete,
    entityType: "quickLink",
    entityId: id,
    entityName: existing.label,
    method: "deleteQuickLink",
    details: {
      label: existing.label,
      url: existing.url,
      icon: formatQuickLinkIconLabel(existing.icon),
      color: existing.color
        ? existing.color.charAt(0).toUpperCase() + existing.color.slice(1)
        : "Auto",
      enabled: existing.enabled,
    },
  });

  revalidateQuickLinks();
  return { ok: true };
}

/**
 * Move a link one step toward the front ("up") or back ("down") of the menu.
 * Renumbering every row first keeps `sortOrder` unique even when legacy rows
 * share values, so the swap always takes effect. No-op at either end.
 */
export async function moveQuickLink(
  id: string,
  direction: "up" | "down",
): Promise<QuickLinkActionResult> {
  const session = await requireAdmin();

  const rows = await listQuickLinks();
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) {
    return { ok: false, error: "Quick link not found" };
  }
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  const neighbor = rows[neighborIndex];
  if (!neighbor) {
    return { ok: true };
  }

  const moved = rows[index];
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i].sortOrder !== i) {
        await tx
          .update(quickLinks)
          .set({ sortOrder: i })
          .where(eq(quickLinks.id, rows[i].id));
      }
    }
    await tx.update(quickLinks).set({ sortOrder: neighborIndex }).where(eq(quickLinks.id, id));
    await tx
      .update(quickLinks)
      .set({ sortOrder: index })
      .where(eq(quickLinks.id, neighbor.id));
  });

  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.quickLinkUpdate,
    entityType: "quickLink",
    entityId: id,
    entityName: moved.label,
    method: "moveQuickLink",
    details: diffFields(
      { order: index + 1, label: moved.label },
      { order: neighborIndex + 1, label: moved.label },
    ),
  });

  revalidateQuickLinks();
  return { ok: true };
}
