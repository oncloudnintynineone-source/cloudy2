"use server";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { appBaseUrl } from "@/lib/appUrl";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { getDashboardViews } from "@/lib/dashboardViews/queries";
import { filterFeedEligibleViews, type DashboardViewTab } from "@/lib/dashboardViews/views";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

import { feedTokenSecret, signFeedUrl } from "./feedToken";
import {
  loadWidgetFilterContext,
  summarizeTabFilters,
  type WidgetFilterContext,
} from "./viewEvents";

export interface WidgetFeedLink {
  viewId: string;
  viewName: string;
  kind: string;
  /** The view's effective Cal/Users/Types/Event-name scope, for the dialog. */
  filterSummary: string;
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
  tabs: readonly DashboardViewTab[];
  context: WidgetFilterContext;
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
        filterSummary: summarizeTabFilters(tab, params.context),
        icsUrl,
        webcalUrl: icsUrl.replace(/^https?:\/\//, "webcal://"),
      },
    ];
  });
}

/**
 * The current signed feed URLs, one per **self-created** dashboard view (share
 * imports are excluded), so the dialog can show and copy the subscription URL
 * for the view the user chooses. Unlike a show-once secret, the URL is derived
 * from a per-user version counter, so it can be displayed again at any time.
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
  const [storedTabs, version, origin, context] = await Promise.all([
    getDashboardViews(userId),
    readFeedVersion(userId),
    appBaseUrl(),
    loadWidgetFilterContext({ id: userId, role: session.user.role }),
  ]);
  return {
    ok: true,
    version,
    links: buildFeedLinks({
      userId,
      version,
      origin,
      secret,
      tabs: filterFeedEligibleViews(storedTabs),
      context,
    }),
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

  const [storedTabs, origin, context] = await Promise.all([
    getDashboardViews(userId),
    appBaseUrl(),
    loadWidgetFilterContext({ id: userId, role: session.user.role }),
  ]);
  return {
    ok: true,
    version,
    links: buildFeedLinks({
      userId,
      version,
      origin,
      secret,
      tabs: filterFeedEligibleViews(storedTabs),
      context,
    }),
  };
}
