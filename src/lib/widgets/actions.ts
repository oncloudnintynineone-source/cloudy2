"use server";

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { userPreferences, widgetTokens } from "@/db/schema";
import { appBaseUrl } from "@/lib/appUrl";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { getDashboardViews } from "@/lib/dashboardViews/queries";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

import { feedTokenSecret, signFeedUrl } from "./feedToken";

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

export interface WidgetFeedLink {
  viewId: string;
  viewName: string;
  kind: string;
  /** HTTPS subscription URL for the calendar app. */
  icsUrl: string;
  /** `webcal://` form for an iOS one-tap subscription. */
  webcalUrl: string;
}

export type WidgetFeedLinksResult =
  | { ok: true; version: number; links: WidgetFeedLink[] }
  | { ok: false; error: string };

async function readFeedVersion(userId: string): Promise<number> {
  const [row] = await db
    .select({ feedVersion: userPreferences.feedVersion })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row?.feedVersion ?? 0;
}

function buildFeedLinks(params: {
  userId: string;
  version: number;
  origin: string;
  secret: string;
  tabs: readonly { id: string; name: string; kind: string }[];
}): WidgetFeedLink[] {
  return params.tabs.flatMap((tab) => {
    const icsUrl = signFeedUrl({
      origin: params.origin,
      userId: params.userId,
      version: params.version,
      viewId: tab.id,
      signatureSecret: params.secret,
    });
    if (!icsUrl) {
      return [];
    }
    return [
      {
        viewId: tab.id,
        viewName: tab.name,
        kind: tab.kind,
        icsUrl,
        webcalUrl: icsUrl.replace(/^https?:\/\//, "webcal://"),
      },
    ];
  });
}

/**
 * The current signed feed URLs, one per dashboard view. Unlike widget tokens,
 * these are derived from a per-user version counter, so they can be shown
 * again at any time.
 */
export async function getWidgetFeedLinks(): Promise<WidgetFeedLinksResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }
  const secret = feedTokenSecret();
  if (!secret) {
    return { ok: false, error: "Calendar feeds are not configured" };
  }
  const [tabs, version, origin] = await Promise.all([
    getDashboardViews(userId),
    readFeedVersion(userId),
    appBaseUrl(),
  ]);
  return {
    ok: true,
    version,
    links: buildFeedLinks({ userId, version, origin, secret, tabs }),
  };
}

/**
 * Rotate the feed link: increments `feed_version`, invalidating every URL that
 * has already been subscribed. Returns the new URLs so the dialog can swap them
 * in place.
 */
export async function rotateWidgetFeedLink(): Promise<WidgetFeedLinksResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }
  const secret = feedTokenSecret();
  if (!secret) {
    return { ok: false, error: "Calendar feeds are not configured" };
  }

  const [row] = await db
    .insert(userPreferences)
    .values({ userId, feedVersion: 1 })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        feedVersion: sql`${userPreferences.feedVersion} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ feedVersion: userPreferences.feedVersion });
  const version = row?.feedVersion ?? 1;

  await logAction({
    ...actorFromUser({
      id: userId,
      name: session.user.name ?? null,
      role: session.user.role,
    }),
    action: AUDIT_ACTIONS.widgetFeedRotate,
    entityType: "widgetFeed",
    entityId: userId,
    entityName: session.user.name ?? null,
    method: "widget.feed",
    details: { feedVersion: version },
  });

  const [tabs, origin] = await Promise.all([getDashboardViews(userId), appBaseUrl()]);
  return {
    ok: true,
    version,
    links: buildFeedLinks({ userId, version, origin, secret, tabs }),
  };
}
