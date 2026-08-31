# 1. Loading & transitions

The app renders data-heavy pages (a month of Google Calendar events behind a
server cache) on small mobile screens, where a flash-of-skeleton or a content
hard-cut reads as jank. This document describes the standard **loading
appearance** — skeleton only, minimum hold, fade-in on reveal — the
**optimistic navigation chrome** that keeps controls answering instantly while
data loads (§1.9), and the **one-shot URL param** pattern (`?edit=` /
`?refresh=` / `?_fresh=`) that drives forced renders without polluting
history. The rules here are canonical for the repo (see also the checklist
bullet in `AGENTS.md`); this is the reference for *why* each piece exists and
where it is wired.

## Table of contents

- [1.1 Problem](#11-problem)
- [1.2 Goals & non-goals](#12-goals--non-goals)
- [1.3 The standard sequence](#13-the-standard-sequence)
- [1.4 Route-level loading](#14-route-level-loading)
- [1.5 Minimum skeleton hold](#15-minimum-skeleton-hold)
- [1.6 Reveal fade](#16-reveal-fade)
- [1.7 One-shot URL params](#17-one-shot-url-params)
- [1.8 No-op navigations & in-page exceptions](#18-no-op-navigations--in-page-exceptions)
- [1.9 Optimistic navigation chrome](#19-optimistic-navigation-chrome)
- [1.10 Client-router reuse window](#110-client-router-reuse-window)
- [1.11 Mutations are out of scope](#111-mutations-are-out-of-scope)
- [1.12 Usage inventory](#112-usage-inventory)
- [1.13 File index & related docs](#113-file-index--related-docs)

## 1.1 Problem

Three failure modes, all observed before this system existed:

- **Skeleton flash**: with warm data (L1 cache hit, or the no-op Google stub in
  dev) an RSC round-trip can land in well under 100 ms. Showing a skeleton for
  that long flashes and makes the content swap read as a hard cut, not a
  load.
- **Scroll position loss**: the dashboard's week/schedule `ScrollArea` is
  horizontally scrollable; remounting the container to reveal content (the
  naive `loading ? <Skeleton/> : <Content/>` with remounting children) drops
  the user's scroll position on every navigation.
- **Stale one-shot params**: `?edit=`/`?refresh=`-style params that force a
  special render must not survive into back/forward history — otherwise a
  back navigation re-triggers the forced behavior.

## 1.2 Goals & non-goals

**Goals**

- **The skeleton is the only loading indicator** — content is never dimmed or
  darkened while loading (the `opacity: isPending ? 0.6 : 1` pattern is banned).
- Every skeleton→content reveal reads as a deliberate, perceptible sequence,
  even for sub-100 ms loads (minimum hold, §1.5).
- Content fades in over ~300 ms on reveal, **and** on cold first paint — the
  class ships in the SSR HTML, so no JS is needed for the first fade
  (§1.6).
- Containers that must not remount (scroll position) keep their identity; the
  animation is restarted on them, not the DOM (§1.6).
- One-shot params force exactly one render and strip themselves out of the
  URL, so history entries stay clean (§1.7).
- Reduced-motion users get the hard swap: all animation lives inside
  `@media (prefers-reduced-motion: no-preference)`.

**Non-goals**

- No progress bars, no percentages, no per-resource loading states.
- Mutations (server actions) do not use skeletons at all — the button's loader
  covers them (§1.9).
- Not a data cache: freshness/invalidation is
  [`events-cache.md`](events-cache.md)'s job; this doc only describes the
  *appearance* of a load.

## 1.3 The standard sequence

```mermaid
stateDiagram-v2
    [*] --> loading: navigation starts (startTransition)
    loading --> loading: pending stays true
    loading --> hold: pending false, but < 350ms since start
    hold --> revealed: hold expires
    loading --> revealed: pending false after >= 350ms
    revealed --> [*]: content-enter fade plays (~300ms)
    note right of hold
        holds never stack:
        a new pending supersedes
        an outstanding hold
    end note
```

1. A **data navigation** (view/tab/date/month/filter change that changes the
   server fetch) runs inside `startTransition`; the route's `loading.tsx`
   (or the in-page skeleton swap) shows while `isPending`.
2. `useMinSkeletonHold` extends the hold to a minimum of
   `MIN_SKELETON_HOLD_MS` (350 ms) from the load's start.
3. On reveal, `useContentEnter` (or the SSR-shipped class) plays the
   `content-enter` fade.
4. URL-only changes (one-shot param strips, in-month day sync) use **plain
   `router.push` outside `startTransition`** — no pending flag, no skeleton,
   no fade.

## 1.4 Route-level loading

Every route segment that awaits data has a `loading.tsx` (the automatic
Suspense fallback), shaped to match the real content:

| Segment | `loading.tsx` |
| ------- | ------------- |
| `(protected)/dashboard` | view-aware: reads the `cloudy2.ui` cookie (validated by the shared `resolveDashboardView`) and renders the matching per-view grid skeleton; month rows from `monthGridRows()` on the remembered/URL-silent month. Loading files receive no URL props, so an explicit `?view=` link or `edit` deep link can briefly disagree with a divergent remembered view |
| `(protected)/parade-state` | day card + rows from `paradeStateSkeleton.tsx` |
| `(protected)/contacts` | list skeleton |
| `(protected)/settings/users` | user card skeletons |
| `(protected)/settings/audit-log` | search bar + 4 × `AuditLogRowSkeleton` |
| `(protected)/settings/templates` | form skeleton |
| `(protected)/settings/departments` | card skeletons |
| `(protected)/settings/event-types` | card skeletons |
| `(protected)/settings/general` | form skeleton |

The `(protected)` **layout itself no longer awaits DB work before rendering the
AppShell** — the announcement-banner and KAH-status reads are streamed inside
`<Suspense>` slots, so the shell chrome + the route skeleton above paint as soon
as the (JWT-only) session resolves. This matters for first paint: the layout's
old `getBanner()`/`userHasKahGroup()` awaits sat in front of every route's
`loading.tsx`, so a Neon scale-to-zero cold start left the browser with nothing
to paint (Android PWA splash stuck) for the whole wake-up. See
[`announcement-banner.md`](announcement-banner.md) §1.1/§1.3.

The row/card skeletons are extracted into small **shared components** so the
route fallback and the in-page swap stay in sync: `dashboard/calendarSkeleton.tsx`
(all five view grids — `MonthGridSkeleton`, `WeekMatrixSkeleton` (Week (D)
matrix), `WeekGridSkeleton` (Week (H)), `AgendaListSkeleton`, `ScheduleGridSkeleton`),
`parade-state/paradeStateSkeleton.tsx`,
`settings/audit-log/AuditLogRowSkeleton.tsx`.

The PWA **launch shell** (`public/loading.html`, served by the service worker
for the start URL) mirrors the dashboard route skeleton — all five view
variants, Mantine's exact palette values and pulse, brand-bar header, bottom-nav
placeholders — so a stale launch's handoff from the precached shell to the
streamed `loading.tsx` fallback reads as **one continuous skeleton**, not two
different ones; warm launches skip the shell entirely via the fresh-document
redirect (`pwa-offline.md` §1.5.1). `launchShell.test.ts` guards the drift.

Every skeleton block also includes a **`LoadingStatus`**
(`src/components/LoadingStatus.tsx`): a sr-only `role="status"` announcement
("Loading calendar…" etc.), since skeletons are visual-only. Server-safe, so
the same component serves the route `loading.tsx` files and the client-side
skeleton swaps (dashboard `gridLoading`, parade-state `contentLoading`,
audit-log `listLoading`, pinned-events panel). See
[`accessibility.md`](accessibility.md) §1.3.

The committed content's root carries `CONTENT_ENTER_CLASS`
(`src/lib/loading/contentEnter.ts:12`): the class ships in the SSR HTML, so
the fade plays on first paint (no JS, no hydration flash), segment remounts
replay it, and `router.refresh()` mutations don't remount — so they never
replay it.

## 1.5 Minimum skeleton hold

`useMinSkeletonHold(pending, holdMs = 350)`
(`src/lib/loading/minHoldLoading.ts:24`):

- Returns `pending || holdRemaining`. While `pending`, it records
  `performance.now()` on the rising edge. When the load ends early,
  `holdRemaining` stays true until `holdMs` have elapsed since the start.
- **Holds never stack**: a new `pending` supersedes any outstanding hold —
  fast consecutive navigations each hold from their own start, so the
  skeleton can't accumulate delays.
- Timing uses `performance.now()` **in effects only**, so SSR renders are
  unaffected.
- The 350 ms constant is `MIN_SKELETON_HOLD_MS` (`:12`) — deliberately long
  enough to read as a deliberate pause, short enough not to feel slow.

Callers gate their *in-page* skeleton on the held value, e.g.
`gridLoading = useMinSkeletonHold(isPending || isRefreshing)`
(`DashboardView.tsx:450`) — the force-refresh transition's `isRefreshing`
participates in the same hold.

## 1.6 Reveal fade

**Cold mount**: `CONTENT_ENTER_CLASS` on the content root (see §1.4). The
animation is `content-enter` — `opacity: 0 → 1`, 300 ms ease-out
(`src/app/globals.css:1-5, 31-34`) — inside the
`prefers-reduced-motion: no-preference` guard.

**In-page reveal into a stable container**: the dashboard's week/schedule
`ScrollArea` must **not** remount across navigations (it owns the horizontal
scroll position), so the fade can't be restarted by unmounting.
`useContentEnter(ref, shown)` (`src/lib/loading/contentEnter.ts:27`) instead:

- watches `shown` (i.e. `!loading`) and, on a `false → true` flip,
- removes the class, forces a style flush (`void el.offsetWidth`), and
  re-adds it — restarting the one-shot CSS animation;
- runs in `useLayoutEffect`, so it happens **before paint**: the reveal frame
  already shows the fade at frame 0 instead of a fully-opaque flash;
- skips the first mount (`prev === null`) — the SSR-shipped class is already
  playing there.

Related CSS in `globals.css`: the agenda day's directional slide-in
(`agenda-slide-next`/`agenda-slide-prev`, `:9-29, 36-42`) — the in-month day
change plays the slide *instead* of the skeleton (§1.8).

## 1.7 One-shot URL params

Three params force a special render for exactly one request, then strip
themselves. All strips are plain `router.push` **outside** `startTransition`
(no skeleton, no fade), and all are ref-guarded or self-terminating so a
stale history entry can't re-trigger the behavior.

| Param | Purpose | Validity | Stripped by |
| ----- | ------- | -------- | ----------- |
| `?edit=<uuid>` | open the event's edit form (deep link from the `Edit:` note line) | `isUuid` — anything else ignored (`dashboard/page.tsx:47-48`); the link's `date` pins the fetched month; the remembered-UI-state cookie is skipped for the render ([`ui-state.md`](ui-state.md)) | ref-guarded effect after the forced render mounts (`DashboardView.tsx:655-665`) — a refresh won't reopen the form |
| `?refresh=<epoch-ms>` | force-refresh: bypass the cache freshness windows and block on fresh Google reads **inside the same RSC request** | finite number younger than `REFRESH_NONCE_TTL_MS` (5 min, `page.tsx:29,89-90`) — a stale history entry can't silently re-force (`events-cache.md` §1.5.1) | self-terminating effect (`DashboardView.tsx:667-678`) — a ref guard would leak a second nonce if refresh is clicked before the first strip lands |
| `?_fresh=1` | skip the remembered-UI-state cookie for this one render (a navigation that *removed* remembered keys — Clear, tab switch — must not re-apply the now-stale cookie) | any value — presence is enough (`dashboard/page.tsx:56`, `parade-state/page.tsx:34`) | self-terminating effect after mount (`DashboardView.tsx:645-653`, `ParadeStateView.tsx:269-274`) |

Injection of `_fresh` is automatic: `navigate()` checks
`freshMarkerNeeded(updates, STATE_KEYS)` (a remembered key set to `null`) and
adds the marker to that one navigation ([`ui-state.md` §1.9](ui-state.md#19-the-_fresh-one-shot-marker)).

```mermaid
sequenceDiagram
    participant V as View (client)
    participant P as Page (server)
    V->>P: router.push(?refresh=<epoch-ms>) — startTransition
    P->>P: nonce valid? → force: true → fresh Google reads in-request
    P-->>V: forced render (skeleton via isRefreshing)
    V->>P: plain router.push stripping ?refresh= (no transition)
    P-->>V: clean URL — history entry no longer carries the nonce
```

Doing the forced work **inside the same RSC render** (rather than
invalidate-then-`router.refresh()`) guarantees the response carries the
just-fetched data — a separate re-read could be served by another instance
whose warm L1 entry still shadows the fresh rows
([`events-cache.md` §1.5.1](events-cache.md#151-force-refresh-manual-one-shot)).

## 1.8 No-op navigations & in-page exceptions

- **No-op guard**: `navigate()` builds the href and returns early when it
  equals the current URL — tapping "Today" while already there doesn't run a
  transition or flash the skeleton (`DashboardView.tsx:618-629`).
- **Parade state**: in-month day switches and filter applies update from local
  state optimistically (already correct), so they show no skeleton; only a
  cross-month switch (the server must fetch the new month) is a data
  navigation — hence `useMinSkeletonHold(initialMonth !== month)`
  (`ParadeStateView.tsx:154`).
- **Dashboard Agenda tab**: in-month day changes (swipe/chevrons/Today/picker)
  apply to local state instantly and sync `?date=` with a plain no-transition
  push; the new day plays the **directional slide-in** classes instead of the
  skeleton. Only a cross-month change is a data navigation with the skeleton
  (`DashboardView.tsx:772-791`).

## 1.9 Optimistic navigation chrome

The skeleton sequence (§1.3) governs the **content**, but on a slow network it
used to leave the *controls* frozen until the RSC response landed: the bottom
nav's active highlight derives from the committed `pathname`, and the
dashboard's tab value / period label derive from server-resolved props. A tap
on a flaky connection read as dead for seconds. The fix is a two-layer split:

- **Chrome** (tab highlight, nav highlight, period label, chevron aria-labels,
  skeleton flavor) flips **optimistically at tap time**, from local state.
- **Data** (grids, rulers, agenda machinery, persisted UI state) keeps
  rendering from committed props — the skeleton covers the gap.

```mermaid
sequenceDiagram
    participant U as User
    participant C as Chrome (local state)
    participant N as Next router
    participant S as Server
    U->>C: tap Week (H) tab
    C->>C: highlight + label flip instantly (shown* state)
    C->>N: startTransition(router.push)
    N->>S: RSC fetch (may take seconds)
    N-->>C: WeekGridSkeleton (Week (H)) meanwhile (optimistic flavor)
    S-->>N: payload
    N-->>C: commit → props update → sync snaps shown* to props
    Note over C: failed/offline fetch: transition ends,<br/>sync reverts chrome to last committed state
```

### 1.9.1 Bottom nav & sidebar (`AppShellShell.tsx`)

`tappedHref` tracks the tapped destination; `active` becomes
`matches(pathname) || href === tappedHref`. Two revert paths keep the
highlight honest:

1. **Commit**: render-phase "adjust state on prop change" sync clears
   `tappedHref` when `pathname` changes.
2. **Abandonment**: a timer (`NAV_TAP_REVERT_MS`, 6 s) clears it when no
   navigation ever lands (stalled or offline request), so the highlight can't
   stick to a destination that was never reached.

Additionally each nav `<Link>` wraps its content in `PendingDim`, which calls
`useLinkStatus()` and dims the icon (~55 %) while that link's navigation is in
flight — subtle inline feedback exactly as the Next.js docs prescribe. (The
hook must run inside the Link subtree; hence the wrapper component rather than
state on the button.)

### 1.9.2 Dashboard date-nav chrome (`DashboardView.tsx`)

`shownView` / `shownMonth` / `shownDate` mirror the server props but lead them
after a tap. Written by `shiftMonth/shiftDay/shiftWeek/switchView/goToday/
pickDate`; reconciled by one render-phase sync keyed on
`(view, month, date, isPending)`:

- While our transition is pending, optimistic values stand (rapid taps compose
  — shifts base on `shown*`, so two quick "+" presses advance two months
  instead of the second being eaten by the no-op guard).
- When the transition ends — commit **or failure** — the sync snaps `shown*`
  back onto whatever the server resolved, self-healing an offline navigation
  instead of stranding the label on an intent that never landed.

What deliberately stays on **committed** props: grid/ruler/agenda rendering
and their guards (`isWeekV2`, `isAnchoredView`, `headerDate`),
`usePersistUiState` (relaunch restores last *committed* state), chevron click
dispatch. The invariant that makes this safe: whenever the data renders
(`!gridLoading`), the sync guarantees `shown === committed`.

The grid **skeleton flavor** and the period label both select by the
optimistic view — the shape and text you asked for are what appear while it
loads (same contract as `loading.tsx` resolving the remembered view from the
cookie).

## 1.10 Client-router reuse window

Next.js defaults `staleTimes.dynamic` to **0** — every soft navigation to a
dynamic page blocks on the network, even one visited moments ago. The config
raises it (`next.config.ts`):

```ts
experimental: { staleTimes: { dynamic: 120 } }
```

Within 2 minutes, revisiting a URL renders its cached client-router payload
instantly — bottom-nav round trips and dashboard tab flips become zero-wait
when the prefetch/cache is warm. This is a *page-snapshot* window only:
hard loads, new param combinations, and the force-refresh nonce are different
cache keys and always hit the server, and freshness of the underlying event
data remains [`events-cache.md`](events-cache.md)'s job. It matches the data
layer's existing tolerance (60 s fresh window, 30 min stale-while-revalidate).

## 1.11 Mutations are out of scope

A `router.refresh()` after a server action is **not** wrapped in a transition:
the button's own loader covers it (Mantine `loading` +
`loaderProps={BUTTON_LOADER_PROPS}`; `form.submitting` for form submits). No
skeleton, no fade — the content stays put while the data updates in place,
and the non-remounting container means `useContentEnter` never replays.

## 1.12 Usage inventory

| Consumer | Minimum hold | Reveal fade | Notes |
| -------- | ------------ | ----------- | ----- |
| `DashboardView` (week/schedule grid) | `useMinSkeletonHold(isPending \|\| isRefreshing)` (`:450`) | `useContentEnter(weekBoxRef, …)` (`:451`) | stable `ScrollArea` keeps scroll position; force-refresh participates in the hold |
| `ParadeStateView` | `useMinSkeletonHold(initialMonth !== month)` (`:154`) | `useContentEnter` (`:156`) | in-month changes are optimistic — no skeleton |
| `AuditLogView` | `useMinSkeletonHold(isPending)` (`:94`) | `useContentEnter` (`:96`) | filter navigations; no-op guard skips the transition |
| `SettingsForm`, `DepartmentTable`, `ContactList`, `UserTable`, `EventTypeTable`, `TemplatesForm` | — | static `CONTENT_ENTER_CLASS` on the content root | server-rendered pages; the SSR fade plays on first paint |
| all nine route segments | — | `loading.tsx` skeletons | §1.4 table |

## 1.13 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/loading/minHoldLoading.ts` | `useMinSkeletonHold` + `MIN_SKELETON_HOLD_MS` |
| `src/lib/loading/contentEnter.ts` | `CONTENT_ENTER_CLASS` + `useContentEnter` |
| `src/components/LoadingStatus.tsx` | Sr-only `role="status"` announcement included with every skeleton block (§1.4, [`accessibility.md`](accessibility.md) §1.3) |
| `src/app/globals.css` | `content-enter` / `agenda-slide-*` keyframes, reduced-motion guard |
| `src/app/(protected)/*/loading.tsx` | Route-level skeletons (9 segments) |
| `src/app/(protected)/dashboard/calendarSkeleton.tsx` | All five view grid skeletons (shared by route + in-page): `MonthGridSkeleton`, `WeekMatrixSkeleton`, `WeekGridSkeleton`, `AgendaListSkeleton`, `ScheduleGridSkeleton` |
| `src/lib/ui/uiState.ts` | `resolveDashboardView` — shared view resolution for page + route fallback |
| `src/app/(protected)/parade-state/paradeStateSkeleton.tsx` | Parade row skeletons (shared) |
| `src/app/(protected)/settings/audit-log/AuditLogRowSkeleton.tsx` | Audit row skeleton (shared) |
| `src/app/(protected)/dashboard/DashboardView.tsx` | Held loading, reveal fade, one-shot strips (`edit`/`refresh`/`_fresh`), agenda slide, optimistic date-nav chrome (`shown*`, §1.9.2) |
| `src/app/(protected)/parade-state/ParadeStateView.tsx` | Month-gated hold, `_fresh` inject/strip |
| `src/components/AppShellShell.tsx` | Optimistic nav highlight (`tappedHref`) + `PendingDim`/`useLinkStatus` (§1.9.1) |
| `next.config.ts` | `experimental.staleTimes.dynamic = 120` client-router reuse window (§1.10) |
| `src/app/(protected)/dashboard/page.tsx` | `?edit=`/`?refresh=` nonce validation |

Related docs:

- [`accessibility.md`](accessibility.md) — the `LoadingStatus` skeleton
  announcement convention (§1.4) and the shell's live region.
- [`ui-state.md`](ui-state.md) — the `?_fresh` marker's role in remembered-state
  removals.
- [`events-cache.md`](events-cache.md) — what the loads load (the month cache)
  and the force-refresh mechanism.
- `AGENTS.md` — the "Standard loading appearance" checklist (canonical rules).
- [`developer-guide.md`](developer-guide.md#112-related-docs) — documentation index.
- `progress-archive.md` — phase write-ups: 1.52/1.53 (stale-while-navigating grid,
  cold-load reveal), 1.58/1.59 (skeleton-only loading across the app), 1.64/1.65
  (agenda slide-in).
