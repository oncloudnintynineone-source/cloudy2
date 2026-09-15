/**
 * The user-created dashboard "Views" (tabs) domain — pure vocabulary, shape
 * and normalization. A tab is a server row in `user_dashboard_views`: one
 * renderer kind (Month / Week (H) / Week (D) / Week (Grid) / Day / Agenda /
 * Dual Pane), a
 * user-chosen display name, a per-user strip order, and that tab's own filter
 * overrides. Tabs are stored server-side per account (design:
 * docs/dashboard-views.md, docs/ui-state.md).
 *
 * Filter semantics (this module + the read-time validation in the dashboard
 * page): each of `cal`/`users`/`types` is either `null` — meaning "role
 * default" (admin: all calendars; non-admin: their own department; users and
 * event types default to nothing) — or an explicit array of selections,
 * including an empty array (a genuine "cleared" selection). Stored ids/names
 * are re-validated against live data on every dashboard render.
 */

/** The dashboard view renderer kinds a tab can be. Order is the display order
 *  of the type picker (both Add-view and Edit-view dialogs). */
export const DASHBOARD_VIEW_KINDS = [
  "dual",
  "month",
  "week",
  "weekv2",
  "weekgrid",
  "schedule",
  "agenda",
] as const;
export type DashboardViewKind = (typeof DASHBOARD_VIEW_KINDS)[number];

/** Display labels for the kinds (the default tab names + type-picker rows). */
export const DASHBOARD_VIEW_KIND_LABELS: Record<DashboardViewKind, string> = {
  month: "Month",
  week: "Week (H)",
  weekv2: "Week (D)",
  weekgrid: "Week (Grid)",
  schedule: "Day",
  agenda: "Agenda",
  dual: "Month & Agenda",
};

export function isDashboardViewKind(value: unknown): value is DashboardViewKind {
  return typeof value === "string" && (DASHBOARD_VIEW_KINDS as readonly string[]).includes(value);
}

/**
 * The display name a tab keeps when its kind is changed (Manage views → Change
 * type). The mirror of the Add-view dialog's "the default name follows the
 * chosen kind": a tab whose name still equals its old kind's default label
 * (i.e. it was never customized past the default) adopts the new kind's
 * default label; a custom name is left untouched. Applied server-side from
 * the stored row so the client can't drift from the rule.
 */
export function nameAfterKindChange(
  currentName: string,
  oldKind: DashboardViewKind,
  newKind: DashboardViewKind,
): string {
  if (oldKind === newKind || currentName !== DASHBOARD_VIEW_KIND_LABELS[oldKind]) {
    return currentName;
  }
  return DASHBOARD_VIEW_KIND_LABELS[newKind];
}

/** Longest allowed user-chosen tab name. */
export const DASHBOARD_VIEW_NAME_MAX_LENGTH = 40;

/**
 * A tab's own filter overrides as stored: `null` = role default, an array
 * (including `[]` = cleared) = an explicit selection.
 */
export interface DashboardTabFilters {
  cal: string[] | null;
  users: string[] | null;
  types: string[] | null;
}

export function emptyTabFilters(): DashboardTabFilters {
  return { cal: null, users: null, types: null };
}

/** Client/view shape of one tab (no timestamps, filters parsed). */
export interface DashboardViewTab {
  id: string;
  kind: DashboardViewKind;
  name: string;
  sortOrder: number;
  filters: DashboardTabFilters;
}

export type DashboardViewNameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Trim + length-limit a user-chosen tab name. Blanks and over-long names are
 * rejected with a user-facing message.
 */
export function sanitizeDashboardViewName(raw: unknown): DashboardViewNameResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Enter a name" };
  }
  const value = raw.trim();
  if (value.length === 0) {
    return { ok: false, error: "Enter a name" };
  }
  if (value.length > DASHBOARD_VIEW_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep the name under ${DASHBOARD_VIEW_NAME_MAX_LENGTH} characters`,
    };
  }
  return { ok: true, value };
}

/**
 * A stored filter override: only arrays of non-empty strings pass through; a
 * non-array / garbage decodes to `null` (role default). An explicit empty
 * array is preserved — it records a genuine "cleared" selection.
 */
export function normalizeFilterOverride(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/**
 * Pick the tab a dashboard render should show. Candidate order: the URL
 * `?view=` (a tab id, or a legacy kind string → the first tab of that kind),
 * then the fallback tab id (the held/current tab during client-side
 * resolution; the server passes `null`), then the first tab in strip order.
 * Unknown/foreign values all fall through to the fallback/first tab; the
 * function never throws and returns `undefined` only when there are no tabs.
 */
export function resolveActiveTab(
  candidate: string | null | undefined,
  fallbackId: string | null,
  tabs: readonly DashboardViewTab[],
): DashboardViewTab | undefined {
  if (tabs.length === 0) {
    return undefined;
  }
  if (typeof candidate === "string" && candidate.length > 0) {
    const byId = tabs.find((tab) => tab.id === candidate);
    if (byId) {
      return byId;
    }
    if (isDashboardViewKind(candidate)) {
      const byKind = tabs.find((tab) => tab.kind === candidate);
      if (byKind) {
        return byKind;
      }
    }
  }
  if (fallbackId !== null) {
    const fallback = tabs.find((tab) => tab.id === fallbackId);
    if (fallback) {
      return fallback;
    }
  }
  return tabs[0];
}

/**
 * The direction of a view (tab) switch, for the content swipe animation:
 * `-1` when the target sits earlier in the strip — the new view enters from the
 * **left** and travels left-to-right — `1` when it sits later (enters from the
 * right), and `0` when the tab is unchanged or either id is unknown. Pure so the
 * mapping is unit-tested.
 */
export function viewSwitchDirection(
  previousId: string,
  nextId: string,
  tabs: readonly Pick<DashboardViewTab, "id">[],
): 1 | -1 | 0 {
  if (previousId === nextId) {
    return 0;
  }
  const previousIndex = tabs.findIndex((tab) => tab.id === previousId);
  const nextIndex = tabs.findIndex((tab) => tab.id === nextId);
  if (previousIndex < 0 || nextIndex < 0) {
    return 0;
  }
  return nextIndex < previousIndex ? -1 : 1;
}

/**
 * The direction of a period (date) move, for the content swipe animation:
 * `1` when the target is later in time — the new period enters from the
 * **right** and travels right-to-left (matching the Agenda slide) — `-1` when it
 * is earlier (enters from the left), and `0` when either key is absent or
 * unchanged. Keys are ISO `YYYY-MM` (Month) or `YYYY-MM-DD` (day-anchored), so a
 * lexicographic compare is a chronological one. Pure so the mapping is
 * unit-tested.
 */
export function periodSwitchDirection(
  previousKey: string | null,
  nextKey: string | null,
): 1 | -1 | 0 {
  if (previousKey === null || nextKey === null || previousKey === nextKey) {
    return 0;
  }
  return nextKey > previousKey ? 1 : -1;
}

/** The current period/kind a tab switch is resolving from. */
export interface TabSwitchContext {
  /** The committed active renderer kind. */
  view: DashboardViewKind;
  /** The currently shown day anchor (ISO `YYYY-MM-DD`). */
  shownDate: string;
  /** Today's date (ISO `YYYY-MM-DD`). */
  today: string;
}

/**
 * The URL updates a tab tap applies — the period-follows-kind rule shared by
 * the tap handler (`switchTab`) and the RSC prefetch, so a prefetched href is
 * exactly the one the tap will push (and lands in the client-router cache):
 *
 * - Month → Month keeps the shown month; an anchored → Month move carries the
 *   anchor's month (Month has no day anchor of its own);
 * - Month → anchored starts on today;
 * - anchored → a different anchored kind keeps the anchor day;
 * - same kind keeps the current period (just the `?view=` change).
 *
 * Dual Pane is a day-anchored kind too (its Month pane follows the agenda
 * day's month), so it rides the anchored branches unchanged.
 *
 * Returns the `navigate`-style updates map (`null` deletes a param). Pure and
 * unit-tested.
 */
export function tabSwitchTarget(
  target: Pick<DashboardViewTab, "id" | "kind">,
  context: TabSwitchContext,
): Record<string, string | null> {
  const { id, kind } = target;
  if (kind === "month") {
    if (context.view === "month") {
      return { view: id };
    }
    return { view: id, month: context.shownDate.slice(0, 7), date: null };
  }
  if (context.view === "month") {
    return { view: id, date: context.today, month: null };
  }
  if (kind !== context.view) {
    return { view: id, date: context.shownDate, month: null };
  }
  return { view: id };
}

/**
 * Whether tapping a tab must force a server re-read instead of relying on the
 * held record's request key (`viewId|months`), which is definition-blind:
 *
 * - the target id is **not in the held `tabs`** — a freshly created view (or a
 *   foreign/deep-linked id). The request key would resolve the unknown id back
 *   to the held tab and look already covered, so the new tab would never load
 *   until a Force refresh;
 * - the target **is the active tab under a changed kind** (edited in place) —
 *   same id, so the request key can't tell the definitions apart;
 * - `force` — an explicit override from a CRUD navigation (e.g. deleting the
 *   active view, whose next tab is a known id that the stale held list would
 *   otherwise satisfy with a local swap, leaving the deleted row behind).
 *
 * A normal switch between two known tabs is left to the warm-cache path. Pure
 * and unit-tested.
 */
export function tabSwitchNeedsReload(params: {
  target: Pick<DashboardViewTab, "id" | "kind">;
  activeView: Pick<DashboardViewTab, "id" | "kind">;
  tabs: readonly Pick<DashboardViewTab, "id">[];
  force?: boolean;
}): boolean {
  if (params.force) {
    return true;
  }
  if (!params.tabs.some((tab) => tab.id === params.target.id)) {
    return true;
  }
  return (
    params.target.id === params.activeView.id && params.target.kind !== params.activeView.kind
  );
}
