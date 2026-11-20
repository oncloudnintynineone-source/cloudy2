"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { kahGroupMembers, kahGroups, users } from "@/db/schema";
import { commitAdminWrite } from "@/lib/actions/adminWrite";
import type { ActionResult } from "@/lib/actions/result";
import { AUDIT_ACTIONS } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import {
  normalizeKahGroupName,
  normalizeKahPercentage,
  validateKahGroupForm,
  type KahGroupFormValues,
} from "@/lib/kah/validate";
import { getUsersByIds } from "@/lib/roster/queries";
import { requireAdmin } from "@/lib/session";
import { onlyUuidIds } from "@/lib/uuid";

export type KahGroupActionResult = ActionResult<Record<never, never>, "name" | "minPercentage">;

/** Audit details for a group: flat, display-ready, human-readable. */
function auditValues(values: { name: string; minPercentage: number; memberNames: string[] }) {
  return {
    name: values.name,
    requiredInCountry: `${values.minPercentage}%`,
    members: values.memberNames.length > 0 ? values.memberNames : undefined,
  };
}

/**
 * Normalize a validated form into DB values. The name is required by
 * `validateKahGroupForm`, so the failure return here only guards stale
 * clients; member ids are filtered to well-formed uuids.
 */
function normalizeForm(
  input: KahGroupFormValues & { memberIds?: unknown },
):
  | { ok: true; values: { name: string; minPercentage: number; memberIds: string[] } }
  | { ok: false; error: string; field: "name" | "minPercentage" } {
  const name = normalizeKahGroupName(input.name);
  if (!name) {
    return { ok: false, error: "Name is required (max 80 characters)", field: "name" };
  }
  const rawIds = Array.isArray(input.memberIds) ? input.memberIds : [];
  return {
    ok: true,
    values: {
      name,
      minPercentage: normalizeKahPercentage(input.minPercentage),
      memberIds: onlyUuidIds(rawIds),
    },
  };
}

/** Shared validate+normalize head of create/update. */
async function checkedNormalizedForm(
  input: KahGroupFormValues & { memberIds?: unknown },
): Promise<{ ok: true; values: { name: string; minPercentage: number; memberIds: string[] } } | {
  ok: false;
  error: string;
  field?: "name" | "minPercentage";
}> {
  const errors = validateKahGroupForm(input);
  if (errors.name || errors.minPercentage) {
    return {
      ok: false,
      error: errors.name ?? errors.minPercentage!,
      field: errors.name ? "name" : "minPercentage",
    };
  }
  return normalizeForm(input);
}

/** Replace a group's membership wholesale (the picker submits the full set). */
async function replaceMembers(groupId: string, memberIds: string[]): Promise<void> {
  await db.delete(kahGroupMembers).where(eq(kahGroupMembers.groupId, groupId));
  if (memberIds.length > 0) {
    await db
      .insert(kahGroupMembers)
      .values(memberIds.map((userId) => ({ groupId, userId })));
  }
}

/** Display names of a group's current members, sorted by name. */
async function currentMemberNames(groupId: string): Promise<string[]> {
  const rows = await db
    .select({ name: users.name })
    .from(kahGroupMembers)
    .innerJoin(users, eq(users.id, kahGroupMembers.userId))
    .where(eq(kahGroupMembers.groupId, groupId))
    .orderBy(users.name);
  return rows.map((row) => row.name);
}

/** Display names for a submitted id set, sorted by name (unknown ids dropped). */
async function namesForIds(memberIds: string[]): Promise<string[]> {
  return (await getUsersByIds(memberIds))
    .map((user) => user.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function createKahGroup(
  input: KahGroupFormValues & { memberIds?: unknown },
): Promise<KahGroupActionResult> {
  const session = await requireAdmin();

  const normalized = await checkedNormalizedForm(input);
  if (!normalized.ok) {
    return normalized;
  }

  const [created] = await db
    .insert(kahGroups)
    .values({ name: normalized.values.name, minPercentage: normalized.values.minPercentage })
    .returning({ id: kahGroups.id });
  await replaceMembers(created.id, normalized.values.memberIds);

  await commitAdminWrite({
    session,
    action: AUDIT_ACTIONS.kahGroupCreate,
    entityType: "kah_group",
    entityId: created.id,
    entityName: normalized.values.name,
    method: "createKahGroup",
    details: auditValues({
      ...normalized.values,
      memberNames: await namesForIds(normalized.values.memberIds),
    }),
    effect: "kahGroups",
  });
  return { ok: true };
}

export async function updateKahGroup(
  id: string,
  input: KahGroupFormValues & { memberIds?: unknown },
): Promise<KahGroupActionResult> {
  const session = await requireAdmin();

  const normalized = await checkedNormalizedForm(input);
  if (!normalized.ok) {
    return normalized;
  }

  const [existing] = await db.select().from(kahGroups).where(eq(kahGroups.id, id)).limit(1);
  if (!existing) {
    return { ok: false, error: "KAH group not found" };
  }

  // The pre-change state must be captured before membership is replaced.
  const beforeMemberNames = await currentMemberNames(id);

  await db
    .update(kahGroups)
    .set({
      name: normalized.values.name,
      minPercentage: normalized.values.minPercentage,
      updatedAt: new Date(),
    })
    .where(eq(kahGroups.id, id));
  await replaceMembers(id, normalized.values.memberIds);

  await commitAdminWrite({
    session,
    action: AUDIT_ACTIONS.kahGroupUpdate,
    entityType: "kah_group",
    entityId: id,
    entityName: normalized.values.name,
    method: "updateKahGroup",
    details: diffFields(
      auditValues({
        name: existing.name,
        minPercentage: existing.minPercentage,
        memberNames: beforeMemberNames,
      }),
      auditValues({
        ...normalized.values,
        memberNames: await namesForIds(normalized.values.memberIds),
      }),
    ),
    effect: "kahGroups",
  });
  return { ok: true };
}

export async function deleteKahGroup(id: string): Promise<KahGroupActionResult> {
  const session = await requireAdmin();

  const [existing] = await db.select().from(kahGroups).where(eq(kahGroups.id, id)).limit(1);
  if (!existing) {
    return { ok: true };
  }

  const memberNames = await currentMemberNames(id);
  await db.delete(kahGroups).where(eq(kahGroups.id, id)); // members cascade

  await commitAdminWrite({
    session,
    action: AUDIT_ACTIONS.kahGroupDelete,
    entityType: "kah_group",
    entityId: id,
    entityName: existing.name,
    method: "deleteKahGroup",
    details: auditValues({
      name: existing.name,
      minPercentage: existing.minPercentage,
      memberNames,
    }),
    effect: "kahGroups",
  });
  return { ok: true };
}
