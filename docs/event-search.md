# 1. Event search

A header-launched, free-text search over every department calendar. It reads
events **directly from Google Calendar** (deliberately bypassing the month
cache described in [`events-cache.md`](events-cache.md)), so results are
authoritative within the date range the user picks. Results render in the
lazily-loaded `@mantine/schedule` agenda; tapping one shows a **spinner on that
row** while it navigates to the dashboard, which opens the **shared** full event
detail modal (with in-place Duplicate/Edit/Delete).

## Table of contents

- [1.1 Problem](#11-problem)
- [1.2 Goals & non-goals](#12-goals--non-goals)
- [1.3 Architecture overview](#13-architecture-overview)
- [1.4 The integration method](#14-the-integration-method)
- [1.5 The server action](#15-the-server-action)
- [1.6 Search scope & security](#16-search-scope--security)
- [1.7 Date range & defaults](#17-date-range--defaults)
- [1.8 Searchable surface & limitations](#18-searchable-surface--limitations)
- [1.9 The search modal (lazy-loaded)](#19-the-search-modal-lazy-loaded)
- [1.10 Search history](#110-search-history)
- [1.11 Pure helpers & testing](#111-pure-helpers--testing)
- [1.12 File index & related docs](#112-file-index--related-docs)

## 1.1 Problem

The dashboard answers "what is happening this month in these departments", but
it has no way to answer "where and when did we mention *X*" — the three views
(five calendar views + filters) only show the currently fetched month range,
and the event cache only holds months that have already been viewed. Finding an
event means knowing roughly *when* it happened and paging to it. Search closes
that gap: enter a term, choose a (defaulted) date window, and get every matching
event across every department.

## 1.2 Goals & non-goals

**Goals**

- Free-text lookup across **all** department calendars (any signed-in user).
- Authoritative results: read live from Google, never a cached snapshot.
- A user-chosen window with sensible defaults (1 month back, 3 months ahead).
- A zero-cost entry point: the modal and its imports stay out of the shell's
  initial bundle until the user opens search.

**Non-goals**

- Not a structured query: the search term matches Google's `q` fields only
  (see §1.8) — no event-type/people filters beyond what the title carries.
- No index, no result cache: results are recomputed on every search. (The
  *query history* is a small per-account preference — see §1.10 — not a
  results cache.)
- No edit-in-place from search: tapping a result deep-links to the dashboard,
  which owns the event detail (Duplicate/Edit/Delete) and all mutation wiring.
  The search results are a lookup, not an editor.

## 1.3 Architecture overview

```mermaid
flowchart LR
 subgraph SHELL["AppShellShell (client)"]
 B["header Search ActionIcon<br/>(between pinned + theme)"]
 M["EventSearchModal<br/>dynamic(ssr: false)"]
 SPIN["row spinner<br/>(useTransition isPending)"]
 end
 subgraph ACTION["Server action (search.ts)"]
 R["requireSession()"]
 C["listCalendars() + listEventTypes()"]
 F["mapWithConcurrency <= 4"]
 MAP["mapCalendarItem + dedupeEventsByGroupId"]
 end
 subgraph G["Google Calendar"]
 LIST["events.list(q, timeMin, timeMax)<br/>per calendar"]
 end
 B -->|open| M
 M -->|searchEvents(q, from, to)| R --> C --> F
 F --> LIST
 LIST --> MAP --> M
 M -->|result click| SPIN
 SPIN -->|"/dashboard?date=..&event=.."| DEEP["dashboard EventDetail<br/>(Duplicate / Edit / Delete)"]
```

Search calls `events.list` directly through `getGoogleIntegration()` — it never
touches `fetchRangeEvents` or the `google_event_cache` table.

## 1.4 The integration method

`searchEvents(calendarId, q, timeMin, timeMax)` is added to `GoogleIntegration`
(`src/lib/google/types.ts`) and implemented in the real client
(`src/lib/google/real.ts`) as:

```ts
events.list({ calendarId, q, timeMin, timeMax, singleEvents: true, orderBy: "startTime", maxResults: 2500 })
```

It shares `mapGoogleEvent` with `listEvents`, so the returned `GcalEventItem`s
are identical in shape. The stub returns `[]`.

## 1.5 The server action

`searchEvents(q, from, to)` (`src/lib/events/search.ts`, `"use server"`):

1. `requireSession()`.
2. Trims and enforces `SEARCH_MIN_QUERY_LENGTH` (2) characters.
3. Coerces the date window (§1.7).
4. Loads `listCalendars()` and `listEventTypes()` (the type-color map).
5. Fans out with `mapWithConcurrency` (`SEARCH_CONCURRENCY` = 4) — one
 `events.list` per calendar, running outside any transaction (the Postgres
 pool is `max: 3` by default, and no DB write happens here).
6. Maps each item through the shared `mapCalendarItem` (empty filters) and
 collapses cross-department copies with `dedupeEventsByGroupId`, so one
 logical event appears once regardless of how many department calendars it
 lives in.
7. Sorts by `start` (stable) and returns `{ ok: true, events }`.

Failure surfaces as `{ ok: false, error }` (the client shows it inline); there
is no throw. The result events are `CalendarEvent[]`, the same shape the
dashboard consumes, so `@mantine/schedule` needs no adapter.

## 1.6 Search scope & security

Search runs over **every** registry calendar (`listCalendars()`), for **every
authenticated user** — no admin/own-department narrowing. This mirrors "any
user can invite anyone / tag any department" policy: calendar *visibility* is
department scoped via Google ACLs, but the app does not hide other departments'
events from signed-in users. Editing an event from a result is still gated by
`modifyGuard` in the detail modal it deep-links to. Stub
(unconfigured Google) returns an empty result set, so search degrades to "0
matches" rather than erroring.

Note: because reads go through the service account (owner of every calendar), a
search result set is the union of every department calendar — it is not
per-user ACL-filtered. That matches the existing dashboard read path (which the
service account also serves un-scoped).

## 1.7 Date range & defaults

The window is an inclusive `[from, to]` pair of `YYYY-MM-DD` dates the user
picks; defaults open 1 month back and 3 months ahead of "today" (UTC+8 naive).
The pure helpers live in `src/lib/events/searchRange.ts`:

- `defaultSearchFrom` / `defaultSearchTo` — month arithmetic with day-of-month
  clamping (`Jan 31 − 1 month → Dec 31`).
- `searchRangeBoundaries` — `from` → `timeMin = UTC-midnight`, `to` →
  `timeMax = UTC-midnight of addOneDay(to)` (Google's exclusive all-day-end
  convention), so an event on the `to` date is still included.
- `coerceSearchRange` — swaps a reversed pair and clamps the forward span to
  `SEARCH_MAX_RANGE_DAYS` (730).

On the server, non-`YYYY-MM-DD` inputs fall back to the defaults; the span cap
bounds the number of Google results a single search can pull.

## 1.8 Searchable surface & limitations

Google's `q` matches these event fields: `summary`, `description`, `location`,
and attendee/organizer name+email. In this app:

- **`location`** and the **rendered `summary`** (the title template's output —
  by default just `{description}`, i.e. the raw remarks) are what actually
  match. A blank title or a custom template that omits `{description}` means
  the remarks are **not** searchable.
- The event **type**, **people**, and **departments** are encoded in the
  brotli+base64url notes block inside `description` (`event-lifecycle.md` §1.7)
  and are therefore **not matched by `q`** — a type/people query only hits if
  the title template renders those tokens into the summary.

If exact type/people matching ever becomes a requirement, it needs a decoded
index (a separate concern from this native-search feature; see
`events-cache.md` §1.10 for the codec).

## 1.9 The search modal (lazy-loaded)

`EventSearchModal` (`src/components/EventSearchModal.tsx`):

- Loaded with `dynamic(() => import(...), { ssr: false })` and mounted only
  once first opened (a `searchLoaded` flag in the shell keeps it mounted
  afterward, so the shrink-out animation plays and repeat opens don't reload
  the chunk), so the modal — its `AgendaView`, `DatePickerInput` and
  `@mantine/schedule` usage — never contributes to the shell's first paint.
  The chunk is **prefetched in the background** — `requestIdleCallback` after
  the shell's first paint plus `onPointerEnter`/`onFocus` on the header button
  (the runtime Loadable's `.preload()`, reached through a cast since the TS
  type omits it) — so the first open is instant without pulling the modal into
  the initial bundle.
  Because it mounts already-open on that first open, Mantine's `Transition`
  would initialize to `entered` and skip the zoom-in; the modal therefore
  starts closed and mirrors the `opened` prop into an internal `mounted`
  state. The open flip is deferred by one `requestAnimationFrame` — flipped
  synchronously in an effect, the browser coalesces the enter rAFs into a
  single paint and the zoom still never plays — so the enter animation always
  starts from an `exited` state. Closing flips immediately so the shrink-out
  doesn't lag.
- Owned by `AppShellShell`: the header `ActionIcon` (left of the header Force
  refresh button and the profile menu) toggles it; on click the shell captures the icon's
  rect and passes it down as `originRect`, and the modal zooms out of / shrinks
  back into it via the app's standard `motion/origin` transition (mirroring
  `PinnedEventsPanel`).
- Contents: a query `TextInput` (autofocus), two `DatePickerInput`s (From/To,
  cleared → server defaults), a Search `Button` with `BUTTON_LOADER_PROPS`, and
  an `AgendaView` result list grouped by day. `rangeStart`/`rangeEnd` are the
  first/last result's start day, so empty days in between aren't rendered as
  headers. Results are "No events match your search" when empty.
- A result click shows a **spinner on that row** — an overlay sized to the
  clicked row's box (positional, so multi-day events repeated under several
  date headers never light more than the one row clicked; nothing shifts) — and
  navigates `/dashboard?date=<start day>&event=<group id>&_eventCal=<calendar id>`
  (built by the pure `buildEventDeepLink`, `src/lib/events/deepLink.ts`) inside a
  `useTransition`. The link **preserves the active dashboard tab** (`?view=` is
  carried over when the search was opened from `/dashboard`), so opening a
  result can never fall back to the remembered tab and switch views. It never
  writes the tab's stored filters: the search covers every calendar and the
  active filters may exclude the event, so `_eventCal` names the tapped copy's
  calendar and the server resolves **that one event separately** — only its
  calendar, with no type/user filters — returning it as `deepLinkEvent` on the
  snapshot record root (not in the cached `data`). The grid's `events` stay the
  filtered set, so the result does **not** leak a chip the filters hide; the
  dashboard's own full `EventDetail` (Duplicate/Edit/Delete) opens from the
  resolved event. `_eventCal`/`event` are absent from `dashboardRequestKey`, so
  `DashboardScreen` fires a ref-guarded one-shot refetch when a deep link's
  target is missing from an otherwise-current record (e.g. a same-period link),
  and `DashboardView` holds the deep link "pending" until `deepLinkEvent`
  arrives. The one-shot `event`/`_eventCal` params are stripped after opening
  (re-armed per click, so the same event can be opened again), and
  `DashboardView` re-arms its same-id guard when they clear. Rows stay clickable
  throughout, so a re-click re-triggers navigation. There is no read-only detail
  step.

The Google Calendar notes' `Edit:` link is another producer of the same
`?event=` deep link (it carries `?date=` plus `_eventCal` naming the tapped
copy's calendar, exactly like this search link), and Pinned Events'
tap-to-open a third. See
[`event-lifecycle.md` §1.4.2](event-lifecycle.md#142-deep-links-back-to-the-event).

## 1.10 Search history

The modal shows the user's recent queries as tappable **"Recent searches"
badges** above the form (only when non-empty). History is **per-account** — it
lives in `user_preferences.search_history` (see
[`ui-state.md`](ui-state.md)), a most-recent-first string list that is
case-insensitively deduped and capped at `SEARCH_HISTORY_MAX` (8). Tapping a
badge fills the query and runs the search immediately; a small × on each badge
removes it.

- **Pure helpers** (`src/lib/events/searchHistory.ts`): `addSearchHistoryEntry`
  / `removeSearchHistoryEntry` / `cleanSearchHistoryList` — trim, dedupe, cap.
- **Server actions** (`src/lib/events/searchHistoryActions.ts`, `"use server"`):
  `getSearchHistory`, `recordSearchHistory` (fire-and-forget after a successful
  search), `removeSearchHistory`. The virtual break-glass admin (`id ===
  "admin"`, no `users` row) returns an empty history and no-op writes.
- **Modal wiring**: `EventSearchModal` fetches history on every open (so
  queries run on other devices surface here), records a query + updates the
  local badge list optimistically after a successful search, and removes both
  server-side and locally on ×. History is *not* cleared by the close/reset
  path (which only resets the query/results).

This history is a convenience shortcut, not a results cache — a badge re-runs
the live Google search with the current (defaulted) date window.

## 1.11 Pure helpers & testing

The decision-making parts are pure and unit-tested in
`searchRange.test.ts` (`addMonthsClamped`, `defaultSearchFrom/To`,
`searchRangeBoundaries`, `coerceSearchRange`) and `searchHistory.test.ts`
(`addSearchHistoryEntry`, `removeSearchHistoryEntry`, `cleanSearchHistoryList`,
the cap). Everything that touches Google, Postgres, or the Next runtime (the
`searchEvents` action, `mapCalendarItem` wiring, the `searchHistoryActions`
actions) follows the repo convention of being I/O-bound and untested.

| Helper | Module | Tests |
| ------ | ------ | ----- |
| `addMonthsClamped` | `events/searchRange.ts` | `searchRange.test.ts` |
| `defaultSearchFrom` / `defaultSearchTo` | `events/searchRange.ts` | `searchRange.test.ts` |
| `searchRangeBoundaries` | `events/searchRange.ts` | `searchRange.test.ts` |
| `coerceSearchRange` | `events/searchRange.ts` | `searchRange.test.ts` |
| `addSearchHistoryEntry` / `removeSearchHistoryEntry` / `cleanSearchHistoryList` | `events/searchHistory.ts` | `searchHistory.test.ts` |

## 1.12 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/google/types.ts` | `searchEvents` contract |
| `src/lib/google/real.ts` | `events.list({ ..., q })` implementation |
| `src/lib/google/stub.ts` | `searchEvents` → `[]` |
| `src/lib/events/search.ts` | `searchEvents` server action |
| `src/lib/events/searchRange.ts` | Pure date-range/default helpers (tested) |
| `src/lib/events/searchHistory.ts` | Pure history-list helpers (tested) |
| `src/lib/events/searchHistoryActions.ts` | `getSearchHistory` / `recordSearchHistory` / `removeSearchHistory` actions |
| `src/lib/userPrefs/queries.ts` | `getUserPreferences` (now exposes `searchHistory`) |
| `src/lib/events/queries.ts` | `mapCalendarItem` (now exported; reused by search) |
| `src/app/(protected)/dashboard/EventDetail.tsx` | The shared detail modal the deep link lands on (unchanged) |
| `src/components/EventSearchModal.tsx` | Lazy-loaded search modal + agenda + history badges + row-spinner deep link |
| `src/components/AppShellShell.tsx` | Header search button + modal mount + origin rect + chunk preload |

Related docs:

- [`events-cache.md`](events-cache.md) — the month cache search deliberately bypasses.
- [`event-lifecycle.md`](event-lifecycle.md) — the notes codec (§1.7) and title
  template (§1.8), which determine what `q` can match.
- [`developer-guide.md`](developer-guide.md#112-related-docs) — documentation index.
