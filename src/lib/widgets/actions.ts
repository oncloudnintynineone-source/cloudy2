"use server";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { widgetTokens } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { getDashboardViews } from "@/lib/dashboardViews/queries";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

import {
  MAX_WIDGET_TOKENS_PER_USER,
  generateWidgetToken,
  hashWidgetToken,
  sanitizeWidgetTokenLabel,
  widgetTokenPrefix,
} from "./tokens";

export interface WidgetTokenView {
  id: string;
  label: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface WidgetViewChoice {
  id: string;
  name: string;
  kind: string;
}

export type CreateWidgetTokenResult =
  | {
      ok: true;
      id: string;
      /** Plaintext — shown once and never persisted. */
      token: string;
      label: string;
      prefix: string;
      createdAt: string;
    }
  | { ok: false; error: string };

export type RevokeWidgetTokenResult = { ok: true } | { ok: false; error: string };

/** Active (non-revoked) tokens for the signed-in user, newest first. */
export async function listWidgetTokens(): Promise<WidgetTokenView[]> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return [];
  }
  const rows = await db
    .select({
      id: widgetTokens.id,
      label: widgetTokens.label,
      prefix: widgetTokens.tokenPrefix,
      lastUsedAt: widgetTokens.lastUsedAt,
      createdAt: widgetTokens.createdAt,
    })
    .from(widgetTokens)
    .where(and(eq(widgetTokens.userId, userId), isNull(widgetTokens.revokedAt)))
    .orderBy(desc(widgetTokens.createdAt));
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** The user's dashboard views, for the per-view widget URL list. */
export async function getWidgetViewChoices(): Promise<WidgetViewChoice[]> {
  const session = await requireSession();
  if (!isUuid(session.user.id)) {
    return [];
  }
  const tabs = await getDashboardViews(session.user.id);
  return tabs.map((tab) => ({ id: tab.id, name: tab.name, kind: tab.kind }));
}

/**
 * Mint a per-device token. The plaintext is returned exactly once; only its
 * hash reaches the database. Revoking is the only way to invalidate it, so the
 * label should identify the device.
 */
export async function createWidgetToken(input?: {
  label?: unknown;
}): Promise<CreateWidgetTokenResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }

  const label = sanitizeWidgetTokenLabel(input?.label);
  if (!label.ok) {
    return { ok: false, error: label.error };
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(widgetTokens)
    .where(and(eq(widgetTokens.userId, userId), isNull(widgetTokens.revokedAt)));
  if (n >= MAX_WIDGET_TOKENS_PER_USER) {
    return {
      ok: false,
      error: `You can have at most ${MAX_WIDGET_TOKENS_PER_USER} widget tokens. Revoke one first.`,
    };
  }

  const token = generateWidgetToken();
  const prefix = widgetTokenPrefix(token);
  const [row] = await db
    .insert(widgetTokens)
    .values({
      userId,
      label: label.value,
      tokenHash: hashWidgetToken(token),
      tokenPrefix: prefix,
    })
    .returning({ id: widgetTokens.id, createdAt: widgetTokens.createdAt });

  await logAction({
    ...actorFromUser({
      id: userId,
      name: session.user.name ?? null,
      role: session.user.role,
    }),
    action: AUDIT_ACTIONS.widgetTokenCreate,
    entityType: "widgetToken",
    entityId: row.id,
    entityName: label.value,
    method: "widget.token",
    details: { prefix },
  });

  return {
    ok: true,
    id: row.id,
    token,
    label: label.value,
    prefix,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Revoke one of the signed-in user's tokens. The row is kept for the audit trail. */
export async function revokeWidgetToken(id: string): Promise<RevokeWidgetTokenResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }
  if (!isUuid(id)) {
    return { ok: false, error: "Token not found" };
  }

  const [row] = await db
    .update(widgetTokens)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(widgetTokens.id, id), eq(widgetTokens.userId, userId), isNull(widgetTokens.revokedAt)),
    )
    .returning({ id: widgetTokens.id, label: widgetTokens.label });

  if (!row) {
    return { ok: false, error: "Token not found or already revoked" };
  }

  await logAction({
    ...actorFromUser({
      id: userId,
      name: session.user.name ?? null,
      role: session.user.role,
    }),
    action: AUDIT_ACTIONS.widgetTokenRevoke,
    entityType: "widgetToken",
    entityId: row.id,
    entityName: row.label,
    method: "widget.token",
  });

  return { ok: true };
}
