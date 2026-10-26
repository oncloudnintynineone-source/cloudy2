"use server";

/**
 * Server actions behind shared calendar views (docs/dashboard-views.md §1.10).
 *
 * A share link is self-contained: these actions turn one owned tab into a
 * signed token, resolve a token into a human-readable preview, and append a
 * token's definition as a normal tab for the signed-in recipient. There is no
 * share row and therefore no per-link revoke list.
 */

import { revalidatePath } from "next/cache";

import { listEventTypes } from "@/lib/eventTypes/queries";
import { listCalendars } from "@/lib/events/queries";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { listUsers } from "@/lib/roster/queries";

import { appendDashboardView } from "./mutate";
import {
  countDashboardViews,
  getOwnedDashboardView,
  toDashboardViewTab,
} from "./queries";
import {
  decodeDashboardViewShare,
  encodeDashboardViewShare,
  SHARE_TOKEN_VERSION,
  shareTokenSecret,
  type DashboardViewSharePayload,
} from "./shareToken";
import {
  DASHBOARD_VIEW_KIND_LABELS,
  isDashboardViewKind,
  MAX_VIEWS_PER_USER,
  resolveTabFilters,
  sanitizeDashboardViewName,
  type DashboardViewKind,
} from "./views";

export type ShareLinkResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

export interface SharedViewPreview {
  name: string;
  kind: DashboardViewKind;
  kindLabel: string;
  sharedBy: string;
  calendarNames: string[];
  userNames: string[];
  eventTypeNames: string[];
  /** True when every live calendar is selected (the UI shows one summary). */
  allCalendars: boolean;
  /** How many shared selections no longer exist in the live config. */
  missingFilterCount: number;
  canAdd: boolean;
  viewLimit: number;
}

export type SharedViewPreviewResult =
  | { ok: true; preview: SharedViewPreview }
  | { ok: false; error: string };

export type AddSharedViewResult =
  | { ok: true; id: string; kind: DashboardViewKind }
  | { ok: false; error: string };

const INVALID_LINK = "This share link is invalid or has expired";

/**
 * Resolve the sharer's effective filters before encoding. A stored `null`
 * means the owner's role default; expanding it here means the recipient gets
 * the exact same calendars rather than inheriting their own role default.
 */
export async function createDashboardViewShareLink(viewId: string): Promise<ShareLinkResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }
  const secret = shareTokenSecret();
  if (!secret) {
    return { ok: false, error: "View sharing is not configured on this deployment" };
  }
  const tab = await getOwnedDashboardView(userId, viewId);
  if (!tab) {
    return { ok: false, error: "View not found" };
  }

  const [calendars, users, eventTypes] = await Promise.all([
    listCalendars(),
    listUsers(),
    listEventTypes(),
  ]);
  const calendarIds = calendars.map((calendar) => calendar.id);
  const ownDepartmentId =
    users.find((user) => user.id === userId)?.department?.id ?? null;
  const defaultCalendars =
    session.user.role === "admin"
      ? calendarIds
      : ownDepartmentId
        ? [ownDepartmentId]
        : [];
  const view = toDashboardViewTab(tab);
  const filters = resolveTabFilters(view.filters, {
    calendarIds,
    userIds: users.map((user) => user.id),
    typeNames: eventTypes.map((type) => type.name),
    defaultCalendars,
  });

  const payload: DashboardViewSharePayload = {
    v: SHARE_TOKEN_VERSION,
    n: view.name,
    k: view.kind,
    c: filters.cal,
    u: filters.users,
    t: filters.types,
    b: (session.user.name ?? "").slice(0, 80),
  };
  return encodeDashboardViewShare(payload, secret);
}

/**
 * Decode a link and resolve its ids/names against the live config. Any stale
 * selection is counted but not fatal: the dashboard's normal read-time filter
 * validation decides what the imported copy actually shows.
 */
export async function inspectSharedDashboardView(token: string): Promise<SharedViewPreviewResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }
  const secret = shareTokenSecret();
  if (!secret) {
    return { ok: false, error: "View sharing is not configured on this deployment" };
  }
  const payload = decodeDashboardViewShare(token, secret);
  if (!payload) {
    return { ok: false, error: INVALID_LINK };
  }

  const [calendars, users, eventTypes, viewCount] = await Promise.all([
    listCalendars(),
    listUsers(),
    listEventTypes(),
    countDashboardViews(userId),
  ]);
  const calendarNameById = new Map(calendars.map((calendar) => [calendar.id, calendar.name]));
  const userNameById = new Map(users.map((user) => [user.id, user.name]));
  const typeNames = new Set(eventTypes.map((type) => type.name));

  const calendarNames = payload.c
    .map((id) => calendarNameById.get(id))
    .filter((name): name is string => Boolean(name));
  const userNames = payload.u
    .map((id) => userNameById.get(id))
    .filter((name): name is string => Boolean(name));
  const eventTypeNames = payload.t.filter((name) => typeNames.has(name));
  const allCalendars =
    calendars.length > 0 && calendars.every((calendar) => payload.c.includes(calendar.id));

  return {
    ok: true,
    preview: {
      name: payload.n,
      kind: payload.k,
      kindLabel: DASHBOARD_VIEW_KIND_LABELS[payload.k],
      sharedBy: payload.b,
      calendarNames,
      userNames,
      eventTypeNames,
      allCalendars,
      missingFilterCount:
        payload.c.length - calendarNames.length +
        (payload.u.length - userNames.length) +
        (payload.t.length - eventTypeNames.length),
      canAdd: viewCount < MAX_VIEWS_PER_USER,
      viewLimit: MAX_VIEWS_PER_USER,
    },
  };
}

/**
 * Append the shared definition as an independent tab. The cap is re-checked
 * here (the preview's hint is advisory), and the normal dashboard revalidation
 * makes the new tab show up on the next read.
 */
export async function addSharedDashboardView(token: string): Promise<AddSharedViewResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "Not available for this account" };
  }
  const secret = shareTokenSecret();
  if (!secret) {
    return { ok: false, error: "View sharing is not configured on this deployment" };
  }
  const payload = decodeDashboardViewShare(token, secret);
  if (!payload) {
    return { ok: false, error: INVALID_LINK };
  }
  if (!isDashboardViewKind(payload.k)) {
    return { ok: false, error: INVALID_LINK };
  }
  const name = sanitizeDashboardViewName(payload.n);
  const created = await appendDashboardView(userId, {
    kind: payload.k,
    name: name.ok ? name.value : DASHBOARD_VIEW_KIND_LABELS[payload.k],
    filters: {
      cal: payload.c,
      users: payload.u,
      types: payload.t,
    },
  });
  if (!created.ok) {
    return { ok: false, error: created.error };
  }
  revalidatePath("/dashboard");
  return { ok: true, id: created.id, kind: created.tab.kind };
}
