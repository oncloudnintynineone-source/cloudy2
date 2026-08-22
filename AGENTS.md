# AGENTS.md

Cloud Calendar Movement — internal tool for personnel, leave/event records, and KAH
constraints, with Google Calendar as the event/visibility layer. Single Next.js 16
(App Router) app, **no monorepo**.

## Commands

Use **pnpm** only (`packageManager: pnpm@11.18.0`, Node `>=20.9.0`; CI uses Node 24).

```bash
pnpm dev          # next dev --turbopack
pnpm build        # next build --turbopack
pnpm lint         # eslint (flat config)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run   |   pnpm test:watch
pnpm db:generate  # drizzle-kit generate  -> writes ./drizzle/*.sql
pnpm db:push      # push schema directly to Neon
pnpm db:migrate   # apply migrations
pnpm db:seed      # dev-only seed: departments/users/memberships (idempotent)
```

Run a single test: `pnpm vitest run src/lib/login.test.ts` (or `pnpm test -- <file>`).

**DB scripts need `DATABASE_URL` in the shell env.** `drizzle-kit` (`db:migrate`, `db:push`)
does NOT read `.env.local` — running them directly fails with `Please provide required
params for Postgres driver: url: ''`. `db:generate` is offline (no DB); `db:seed` reads
`.env.local` itself. On Windows PowerShell, load the var first:

```powershell
$line = Get-Content .env.local | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$env:DATABASE_URL = $line.Substring(13).Trim()
pnpm db:migrate
```

CI order matters: `lint -> typecheck -> test -> db:generate` (schema-drift check). On
pushes to `main`, a `migrate` job additionally runs `pnpm db:migrate` against Neon using
the `DATABASE_URL` repo secret — so pending migrations auto-apply on deploy. PRs only run
the quality checks.

## Architecture

- Path alias `@/*` → `./src/*` (tsconfig + vitest both).
- `src/db/index.ts` exports `db` as a **lazy Proxy** over postgres-js — the connection
  is only opened on first use, so build/CI work without a live DB. Never import/require
  `DATABASE_URL` at module load time or build breaks.
- `src/db/schema.ts` is the Drizzle schema (7 tables). `drizzle.config.ts` generates into
  `./drizzle`. **`drizzle/meta/` is committed** (journal + snapshots) — commit both it and
  the generated `*.sql` migration whenever you change the schema. CI's drift check runs
  `pnpm db:generate` then fails on any diff to `drizzle/`.
- The single `settings` row is enforced by a `settings_singleton` check constraint
  (`id = 'singleton'`). `ensureSettingsRow()` in `src/lib/bootstrap.ts` lazily seeds it on
  first auth, hashing `ADMIN_INITIAL_PASSWORD` (env) when no admin password exists yet.
- Auth is **NextAuth v4** (Credentials provider, JWT sessions), not v5. Config in
  `src/lib/auth.ts`; `id`/`role`/`phone` are carried via session callbacks and declared in
  `src/types/next-auth.d.ts`.
- Role/session guards live in `src/lib/session.ts`: `requireSession()`, `requireAdmin()`,
  `getSession()`. Use them in Server Components/route handlers.
- Login is a **single input** auto-detected as admin password or `[phone][keyword]`.
  Parsing lives in `src/lib/login.ts` as pure, I/O-free functions (`parseUserLogin` returns
  the trailing 8 digits). Keep it pure — it's unit-tested without a DB.
- Google Calendar/Gmail access goes through `getGoogleIntegration()` in
   `src/lib/google/index.ts`, which currently returns a no-op stub. Wire the real
   service-account impl there when credentials are provisioned; don't call Google APIs
   directly. Full design in [docs/google-integration.md](docs/google-integration.md).
 - **Calendar month reads are cached server-side.** The dashboard data flow is
   `fetchMonthEvents()` (`src/lib/events/queries.ts`) → `getCachedMonthEventsForCalendars()` in
   `src/lib/google/eventsCache.ts`, a layered cache per department calendar per month. An
   in-process L1 map (keyed `googleCalendarId:month`) serves warm-instance repeat views with no
   I/O; misses fall through to one **batched** `SELECT` on the `google_event_cache` table
   (composite PK `calendar_google_id` + `month`) — a single round-trip for the whole month
    regardless of calendar count; anything absent/expired blocks on a fresh Google `events.list`
    + upsert (bounded concurrency). One entry serves every user/filter on `/dashboard`.
   `fetchMonthEvents()` is a single-month wrapper over `fetchRangeEvents()`
   (`src/lib/events/queries.ts`, the multi-month primitive the dashboard's Week view uses,
   since a Monday-first week can span two months): it fetches each month through the same
   cache, dedupes items across months by (calendar, google event id) — Google month listings
   overlap at boundaries — then applies one type/user-filter + group-dedupe pass, and
   prefetches the months outside the range on a miss. Fresh for 60s (`GCAL_CACHE_FRESH_MS`),
   then stale-while-revalidate for up to 30min (`GCAL_CACHE_EXPIRE_MS`): stale entries are
   served while `after()` refreshes them in
   the background; concurrent refreshes of the same key are coalesced via an in-flight map.
  Never call `integration.listEvents` directly for the month view. In-app mutations call
  `invalidateGcalCache()` (in `src/lib/google/eventsCache.ts`) which purges L1 + in-flight
   entries and deletes the touched DB rows (calendar-id × month sets derived from targets and
   date ranges). The L1 purge is per-instance (map lives only where the mutation ran) while
   the DB delete is shared — so the mutating instance sees the change on `router.refresh()`
   immediately, but other warm instances can serve the pre-change L1 copy for up to
   `GCAL_CACHE_FRESH_MS` (60s) before a background refresh corrects it; `findCopies`
   inside mutations intentionally bypasses the cache. Adjacent months are prefetched in
   `after()` only when the current month missed the cache (`PREFETCH_ADJACENT_MONTHS`). The
   dashboard header has a **force-refresh button**: it navigates with a one-shot
   `?refresh=<epoch-ms>` nonce (honored by `page.tsx` only for 5min so stale history entries
   can't re-force; the client strips the param right after the forced render, mirroring the
   `?edit=` pattern) which makes `fetchMonthEvents` call
   `getCachedMonthEventsForCalendars(..., { force: true })` — skipping L1 and L2 and blocking
   on fresh `events.list` calls for the selected calendars × displayed month **inside the
   same RSC request**, so the response is guaranteed to carry the new data (an
   invalidate-then-`router.refresh()` round-trip could be served by another instance whose
   warm L1 entry still shadows the fresh rows). The button is disabled while Google is
   unconfigured. The pure, tested helpers live in
   `src/lib/google/eventsCacheCodec.ts` (`cacheEntryState`,
  `encodeCachedEvents`, `decodeCachedEvents`) plus `monthsInRange`/`shiftMonth` and
  `mapWithConcurrency`. The cache is deliberately a DB table, not Next's `use cache`/`cacheTag`
   data cache — those require `cacheComponents: true`, which crashed Turbopack `next dev` on
   Node 26 (unfixed vercel/next.js#96165) and added PPR/`instant` complexity. Full design in
   [docs/events-cache.md](docs/events-cache.md).
 - The dashboard and parade-state 3-dot menus group the quick filter
  actions under a `Filters` `Menu.Label` group: a **"My Events"** `Menu.CheckboxItem`
  (toggles the Users filter to the current user, applied immediately, hidden when the
  current user isn't a filter option), a `Clear` item (restores the consumer's default —
  disabled when no filter is active), and `More Filters` (opens the `FilterModal`). The
  same "My Events" quick action also lives inside the dialog as a `FilterGroup.action`
  button beside the Users group label (draft-scoped); the `FilterModal`'s own `Clear`
  button (draft reset) is unchanged. On the dashboard the **Users** filter also narrows
  the rows of the row-based views: when active, Day/Week/Week v2 render exactly the
  selected users' rows (no department rows, no other users) — `buildScheduleResources`'
  `userFilter` (`src/lib/events/schedule.ts`; rows group under each user's own
  department, unassigned users under `Unassigned`). The event data is already filtered,
  and placements for non-rendered rows are ignored by the views (Mantine keys events on
  rendered resources; the matrix reads lanes of rendered rows only), so no
  expansion/lanes changes are needed.
   Non-admins default to their own department but may filter to any department, matching
   the calendar page.
- The dashboard's **Week v2** tab (`?view=weekv2`, fifth tab after Week) is a week
  matrix: X axis = the week (7 columns, one day per column, Monday-first), Y axis = the
  same resource rows as the Day/Week views (department rows + users, grouped per
  department). **No Mantine Schedule component fits this shape** (`WeekView` has no user
  axis; `ResourcesWeekView` columns are 24-hour time lanes; `ResourcesMonthView` always
   spans the whole month) — it is a custom client component in
   `WeekMatrixView.tsx`: a pinned 7-day header over per-department blocks sharing one
   day-column template (`repeat(7, minmax(112px, 1fr))`). The table
   is **full-height** — no internal vertical clamp, the page scrolls — and only the
   horizontal scroll stays internal (ScrollArea `content min-width`, so the day columns
   never shrink below 112px). The day header is a **pinned strip** outside the scroll area
   that sticks to the viewport below the view tabs (`top: calc(var(--app-shell-header-offset)
   + tabBarOffset)`; `DashboardView` measures the `Tabs.List` height) and follows the
   table's horizontal scroll via a `translateX(-scrollLeft)` transform updated directly on
   `onScrollPositionChange` (no per-frame re-render). The **left labels are pinned during
   horizontal scroll** like the Day/Week schedule views: each department block is a flex
   row with a sticky-left group label (`left: 0`, vertical-rl) and each resource row is a
   flex row with a sticky-left shortname label (`left: 1.5rem` when a group column exists)
   beside the shared day grid; sticky labels paint above the banners (`z-index` 5/6 vs
   1) but below the pinned header (10). Cell binning is the pure,
   unit-tested `buildWeekLanes`/`coveredDays` helpers in `src/lib/events/weekMatrix.ts`
    (row semantics = `rowsForEvent`; all-day ends are exclusive → `subOneDay`; multi-day
    events produce a single `WeekSpan` spanning their covered columns, placed in non-overlapping
    lanes via greedy interval partitioning); data comes from the same
    `fetchRangeEvents` 2-month range read as the timeline Week view, so
    cache/filters/force-refresh are inherited unchanged.
  - **Remembered UI state survives relaunch.** The last page, the dashboard's
    view/tab + day/month + Cal/Users/Types filters + pinned tabs, and the
    parade-state day + Cal/Users filters are persisted per-device in one
    cookie, `cloudy2.ui`
    (base64url JSON: `{ lastPage, dashboard: { view, date, month, cal, users, types,
    pinnedViews }, parade: { date, month, cal, users } }`; max-age 1y). The
    **server** reads it
   (`cookies()` in `src/app/page.tsx` and the two pages' `page.tsx`) and applies it
   as a **per-key fallback where the URL param is absent** — URL params always
   win — so a PWA cold start (`start_url /`) redirects to the remembered
   `lastPage` (whitelisted by the pure `resolveLaunchTarget()` in
   `src/lib/ui/uiState.ts`, `/settings/*` admin-only, junk → `/dashboard`) and a
   bare/F5 load of a page renders the remembered view **before first paint, no
   client redirect**. The **client owns the write**: `writeUiState()` in
   `src/lib/ui/uiStateClient.ts` is a read-modify-write of `document.cookie`;
   `useRememberedPage(pathname)` in `AppShellShell.tsx` stores the last page on
   every pathname change (incl. the `/settings` sub-tab), and
   `usePersistUiState(section, values)` in `DashboardView`/`ParadeStateView`
   re-persists the **server-resolved props** after each render — so the cookie
   always converges to exactly what was displayed (stale ids already dropped,
   role defaults after a Clear). When a navigation *removes* remembered keys
   (Clear, "My Events" off, the tab switch off an anchored view), the views'
   `navigate()` auto-injects the one-shot **`?_fresh=1`** marker (pure
   `freshMarkerNeeded()` decides) so that one render skips the cookie and uses
   pure defaults instead of re-applying the stale values; a self-terminating
   strip effect then removes the marker (same pattern as the `refresh`/`edit`
    strips). `?edit=` deep links skip the cookie entirely (explicit intent).
    **Dashboard tabs can be pinned:** the "Pin Tab" `Menu.Item` in the
    dashboard's 3-dot menu (after "Select date"; state-based — "Pin Tab" with
    an outlined `IconStar` when unpinned, "Unpin Tab" with a filled
    `IconStarFilled` when pinned) pins/unpins the *active* tab. Pinned tabs
    render first in the tab bar in pin-recency order (last pinned = leftmost),
    with a filled star icon (`IconStarFilled`, 14px) prefixed to their tab
    name; unpinned tabs keep the default order
    (`DASHBOARD_VIEW_VALUES`). The list is stored in `dashboard.pinnedViews` in
    recency order and shaped by the pure, unit-tested helpers in
    `src/lib/ui/uiState.ts`: `normalizePinnedViews()` (known views only,
    de-duplicated, order-preserving) and `orderDashboardViews()`. Pins are
    **not URL-backed**, so — unlike the other dashboard keys — the page reads
    them from the cookie even on `_fresh`/`edit` renders (every tab switch is a
    `_fresh` render; skipping the cookie there would wipe the pins on the next
    switch). `DASHBOARD_STATE_KEYS` deliberately excludes the key, and a pin
    toggle navigates nowhere (no skeleton, no `_fresh`). `DashboardView` keeps
    the pins in local state (a render-phase sync follows the server-validated
    prop, so back/forward re-resolves win over a stale local toggle) and
    persists them through the same `usePersistUiState` write; the cookie's
    overflow-degrade branch keeps `pinnedViews` alongside view/date/month.
    `clearUiState()` runs on sign-out (`UserMenu.tsx`). The codec/normalizer/
    launch-target/marker helpers are pure and unit-tested in
     `src/lib/ui/uiState.test.ts`; stored values are re-validated server-side like
     URL params, and an oversized cookie degrades by dropping the id lists. Full design in
     [docs/ui-state.md](docs/ui-state.md).

## Conventions

- UI is **Mantine v9**; theme in `src/lib/theme.ts`, mounted by the client component
  `AppProviders` (`src/components/AppProviders.tsx`) from the root layout. The theme
  carries a function value (`components.Input.vars`), which cannot cross the server →
  client boundary, so `MantineProvider` (and `Notifications`) must live in that client
  wrapper — don't move them back into the server `layout.tsx`.
- **Brand colors:** primary is `#0D47A1` (deep blue), secondary is `#FBC02D`
  (amber). Use these two colors whenever an accent color is needed (badges,
  chips, highlights, event type colors, etc.).
  Authenticated routes live under `src/app/(protected)/` inside the AppShell.
 - **The app is mobile-first with a desktop layout at `lg` (992px) and above.** `lg` is
   pinned to 992px by a theme override (`src/lib/theme.ts` sets `breakpoints.lg` to
   `"62em"`) so it matches the `62em` CSS media block and the `visibleFrom="lg"` props.
   Below `lg` it is the original touch layout — bottom nav, stacked **card lists**
   (`Paper` per row, no `<Table>`), floating centered modals with a fixed `size` (never
   `fullScreen`), and the sidebar is hidden (`AppShell navbar collapsed: { mobile: true }`).
   At/above `lg` the shell gains a left sidebar (240px AppShell navbar) and the bottom nav
   collapses; pages center in a 1200px `PageContainer`; the data-dense settings lists
   (Users, Departments, Event Types, Audit Log) switch from cards to Mantine `Table`s
   (`hiddenFrom="lg"` cards + `visibleFrom="lg"` tables — the scoped `<Table>` exception);
   card lists (Contacts, Parade State) reflow through the `.card-grid` CSS class; modals
   widen one size step and forms pair fields into 2-column `Grid`s. Detect the breakpoint
   in client components with
   `useMediaQuery(\`(min-width: ${theme.breakpoints.lg})\`)` — do **not** append `px`
   (`theme.breakpoints.lg` is an em string, so `...lg}px)` would be an invalid query that
   always returns false); pure-CSS switches live in
   `src/app/globals.css` under `@media (min-width: 62em)`. Full design in
   [docs/desktop-responsive.md](docs/desktop-responsive.md).
- **No mobile keyboard pop-up from dropdown taps.** Never render a `searchable`
  `Select`/`MultiSelect` directly: a searchable Mantine combobox target is an editable
  `<input>`, so tapping it on mobile raises the virtual keyboard before the user decided
  to type. Use the shared `NoKeyboardSelect`/`NoKeyboardMultiSelect`
  (`src/components/NoKeyboardSelect.tsx`) instead — they keep a native `readOnly`
  attribute on the target input (via the styles-API `attributes.input`) while the
  dropdown is closed, so a tap only opens the list, and lift it once the dropdown opens
  so the user can tap the field and type to filter. Don't use Mantine's `readOnly` prop
   for this — it disables the whole dropdown. **Department-specific selects are never
   searchable**: the department list is short and always visible, so use plain
   (non-searchable) `Select`/`MultiSelect` instead — their targets are buttons, so a
   tap can't raise the keyboard at all (`CalendarSelect`). The exception is the **User
   form Department field** (`src/app/(protected)/settings/users/UserForm.tsx`), which is
   a row of toggleable `Badge`s — a Mantine Select's focused input triggers the
   browser's focus-scroll on mobile, which visibly "spasms" the modal (see the badge
   comment there).
- **Floating action buttons** use the shared `FloatingActionButton` + `FloatingToolbar`
  (`src/components/FloatingToolbar.tsx`) anchored bottom-right — never a raw `Button`.
  `FloatingActionButton` is a 52×52 circle (`radius="50%"`) with the md shadow; it is
  icon-only — pass the tabler icon as children at `FAB_ICON_SIZE` (24px) plus an
  `aria-label`; `FAB_SIZE`/`FAB_ICON_SIZE` are exported from
  `src/components/FloatingToolbar.tsx`. Don't override width/height inline. The
  default `bottomOffset` clears the **global bottom nav** (`src/lib/bottomNav.ts`); the
  settings pages pass `bottomOffset="var(--settings-fab-bottom)"` — the CSS var is
  declared on `.settings-page-pad` in `src/app/globals.css` (mobile clearance for the
  bottom-docked settings sub-tab bar; `16px` at `lg`).
- **Global bottom nav** lives in `AppShellShell`'s `AppShell.Footer` (height from
  `BOTTOM_NAV_HEIGHT_CSS` in `src/lib/bottomNav.ts`) with four tabs for admins:
  **Calendar** (`/dashboard`), **Parade State** (`/parade-state`), **Contacts**
  (`/contacts`), and **Settings** (`/settings`; regular users get the first three).
  The Settings sub-tab bar `SettingsTabs` stacks directly above it
  (`bottom: BOTTOM_NAV_HEIGHT_CSS`).
- **Admin settings live under `/settings`** (admin-only), reached via the bottom-nav
  Settings tab. A horizontal scrollable `SettingsTabs` bar (`src/app/(protected)/settings/`)
  switches between the Users (`/settings/users`), Departments (`/settings/departments`),
  Event Types (`/settings/event-types`), Templates (`/settings/templates`), General
   (`/settings/general`), and Audit Log (`/settings/audit-log`) tabs. **Event types carry a `shortname`** (their acronym, app-required
   and unique) shown on the type cards and rendered by the `{type:acronym}` title token, and a
   **`location_policy`** (`in`/`out`/`both`, default `both`) restricting where events of the
   type may take place. The restriction is enforced client- and server-side by the pure
    `clampOutOfCamp()` helper in `src/lib/events/locationPolicy.ts` (single source of truth:
    the location is the **out-of-camp destination** — `"in"` forces Out of Camp off and clears
    the location, `"out"` forces it on and keeps it, `"both"` records it only while out of
    camp, in-camp events always have a blank location); the event form locks the Out of Camp
    checkbox and disables the Location textbox accordingly, and `resolveEventLocation()` in
   `src/lib/events/actions.ts` silently re-clamps in both create/update.
  The **Templates tab** holds the two template cards: the **display name template**
  (`settings.name_template`, with `{name}`/`{department}` placeholders, expanded by the pure
  `formatFullName()` helper in `src/lib/settings/formatName.ts`) and the **event title
   template** (`settings.event_title_template`, with `{description}`/`{type}`/`{type:acronym}`/
   `{departments}`/`{location}`/`{people}`/`{people:full}`/`{people:acronym}`/`{people:fqn}`
    tokens — bare `{people}` and `{type}` are the fully qualified/plain names, `{location}` the
    event's location (the out-of-camp destination; blank for in-camp events) — expanded by the
    pure `formatEventTitle()`
   helper in `src/lib/settings/formatEventTitle.ts`). Event titles are rendered into the Google
   event summary on create/edit; the raw description round-trips via the `title` field of the
   event notes JSON so the edit form always prefills the original text. The event's **location**
   is stored in Google's first-class `location` field (not the notes) and an **`outOfCamp`**
   flag (written only when `true`; read by `parseEventNotes` consumers via
   `parseEventOutOfCamp()`) is stored in the notes JSON.
  The notes carry the link written on every create/edit as a human-readable
  `Edit: <url>` line above the notes block (deep link to `/dashboard?date=…&edit=<eventId>`,
  which opens the event's edit form); the app origin is derived from the request headers in
  `src/lib/appUrl.ts`. The block itself is stored opaque — a JSON object brotli-compressed
  and base64url-encoded on one line (`encodeNotesBlock`), with `parseEventNotes` as the
  single reader (it also decodes older raw-JSON events, v1/v2). A final human-readable
  line `Created in cloudy2` (`INTERNAL_EVENT_MARKER`, appended via `withInternalMarker`)
  marks the event as created in the app; events without the marker **and** without a notes
   block are treated as **external** (`isExternalEvent`) — flagged with an "External" badge
   in the event detail and pinned to their calendar's department row in the Day view. The
   event data model and the create/update/delete flows are documented in
   [docs/event-lifecycle.md](docs/event-lifecycle.md) and
   [docs/event-mutations.md](docs/event-mutations.md).
  The **General tab** holds the login keyword and the **audit log retention** setting
  (`settings.audit_log_retention_days`, default 90, clamped 7–365). The **Audit Log tab**
  (`/settings/audit-log`) browses the `audit_logs` table written by `logAction()` (see
  `src/lib/audit/`): URL-param filters (actor / action / entity type / from-to dates / free
  text), keyset pagination via `listAuditLogs`, and CSV export at `/api/audit/export`.
  **Rotation is on-read** — every page render purges rows older than the configured retention
  (indexed delete on `created_at`), plus a manual "Delete older than N days" button; no cron
   job needed. Never call `listAuditLogs`-adjacent helpers directly with a live DB in tests —
   the pure parts (`parseAuditFilters`, cursor codec, CSV builder, display format, event
   audit snapshots) are I/O-free and unit-tested.
   - **`details` payloads are human-readable by design** — no UUIDs, no raw enums, no
     missing datetimes. Event rows (create/update/delete) store an
     `EventAuditSnapshot` (`{ title, description, type, time, outOfCamp, location,
     departments, invitees, creator }`) built by the pure helpers in
     `src/lib/events/eventAudit.ts`: display names instead of ids, and `time`
     pre-formatted in the app's UTC+8 wall clock (`2026-08-21 14:00 – 15:30`,
     `2026-08-21 (AM) – 2026-08-23 (PM)`). `title` is the **rendered Google Calendar
     title** (the same string written to Google — computed by the pure `renderEventTitle`
     helper in `src/lib/events/eventTitle.ts`, shared by the write path and the audit so
     they can't diverge), and `description` is the raw text typed in the event form.
     Create/delete store the snapshot flat (+ `eventId`, `googleEventIds`); update stores
     `diffFields(before, after)` + `eventId`, where the *before* snapshot takes its title
     from the first existing Google copy's summary (`findCopies` returns full
     `GcalEventItem[]` for exactly that reason) and its description/type/time-option/AM-PM/
     out-of-camp/location from that copy's notes — so legacy/external/blank-description
     events still show the visible title, and fields the notes can't supply show the empty
     marker `—` (`EMPTY_VALUE`). User rows carry
     `department` names (not ids); access role changes are `role` field-diffs (previous
     role read via `listCalendarAccess` before the mutation); event-type rows store time
     options / location policy as display labels. The display layer
     (`formatAuditDetails`, `src/lib/audit/format.ts`) renders three shapes: `changes`
     (a FieldDiff → before→after lines, other flat top-level keys as context lines, and the
     stored `after` record as a "Resulting state" section), `fields` (any flat object →
     label/value lines — which is also how legacy rows already in the DB render), and a
      pretty-JSON fallback; labels, enum/boolean/array rendering come from the pure
      `fieldLabel`/`valueString` helpers. Keep new `details` payloads flat and
      human-readable so they render as label/value lines without code changes. Full design
      in [docs/audit-log.md](docs/audit-log.md).
  - **Standard loading appearance: skeleton only + fade-in on reveal.** Apply this
    checklist whenever you **implement or update a loading skeleton** (route fallback,
    in-place navigation, filter change, refetch):
    1. **The skeleton is the only loading indicator — never dim or darken content while
       loading** (the `opacity: isPending ? 0.6 : 1` pattern is banned). Shape the skeleton
       to match the real content; extract the row/card skeleton into a small shared
       component so `loading.tsx` and the in-place swap stay in sync (e.g.
       `audit-log/AuditLogRowSkeleton.tsx`, `parade-state/paradeStateSkeleton.tsx`,
       `dashboard/calendarSkeleton.tsx`).
    2. **Route level:** every route segment that awaits data gets a `loading.tsx` (auto
       Suspense fallback; e.g. `src/app/(protected)/settings/users/loading.tsx`). Put the
       shared `CONTENT_ENTER_CLASS` (`src/lib/loading/contentEnter.ts`) on the committed
       content's root: it ships in the SSR HTML so the fade plays on first paint (no JS, no
       hydration flash), segment remounts replay it, and `router.refresh()` mutations don't
       remount so they never replay it.
    3. **Client-side pending** (URL transitions, blocking refetches): gate the skeleton on
       `useMinSkeletonHold(pending)` (`src/lib/loading/minHoldLoading.ts`) — a ~350ms
       minimum hold (`MIN_SKELETON_HOLD_MS`) so fast L1-cached loads read as a deliberate
       sequence instead of a flash. The revealed content fades in over ~300ms: for a stable
       container that must NOT remount (e.g. the dashboard's week/schedule `ScrollArea`
       keeps its scroll position across navigations) call
       `useContentEnter(ref, !loading)` to restart the CSS animation on the reveal
       (remove/reflow/re-add the class in a `useLayoutEffect` — it runs before paint, so the
       reveal frame already shows the fade at frame 0). The animation lives in
       `src/app/globals.css` (`.content-enter`, 300ms ease-out, inside
       `@media (prefers-reduced-motion: no-preference)` — reduced-motion users get the hard
       swap).
    4. **One-shot param strips & no-ops:** one-shot URL params (`edit`/`refresh`-style) are
       stripped with a plain `router.push` outside `startTransition` (no skeleton, no
       fade); `navigate()` returns early when the built href equals the current URL so a
       no-op change (tapping "Today" while already there) doesn't flash the skeleton.
    5. **Mutations are out of scope:** `router.refresh()` after a server action is not
       wrapped in a transition — the button's loader covers it; no skeleton, no fade.
    - In-page exception: the parade-state page updates in-month day switches and filter
      applies optimistically from local state (already correct), so those show no skeleton;
      only the cross-month switch (server must fetch the new month's events) does. The
      dashboard's **Agenda tab** is the same: in-month day changes (swipe/chevrons/Today/
       picker) apply to local state instantly and sync `?date=` with a plain no-transition
       `router.push` (no skeleton, no fade — the new day plays the directional slide-in
       classes instead); only a cross-month change is a data navigation with the skeleton.
       Full design in [docs/loading-transitions.md](docs/loading-transitions.md).
 - **Buttons that trigger async work must show a loading indicator in the button itself.**
   Use Mantine's `loading` prop on `Button` together with the shared
   `loaderProps={BUTTON_LOADER_PROPS}` from `src/lib/theme.ts`. For `useForm`-backed submit
   buttons use `loading={form.submitting}` (auto-managed by `form.onSubmit`, also prevents
   double-submits); for manual handlers (deletes, status toggles, add/remove rows, etc.)
   hold a local `loading` state around the `await` — set it before the call, clear it in a
   `finally` block — and guard against re-entry (see `src/components/LoginForm.tsx`).
 - The **Users** section is the route `/settings/users` (admin-only), but its internal domain
   code (types/actions/queries) lives under `src/lib/roster/*`. The "roster" module name is
   internal and should not be renamed to match the UI label. The roster model and calendar
   sharing (Google-only ACLs, reconcile-on-read/write) are documented in
   [docs/roster-sharing.md](docs/roster-sharing.md).
- **Prettier uses double quotes** (`singleQuote: false`) and `printWidth: 100` — not the
  common TS single-quote default.
- ESLint 9 flat config composes `eslint-config-next/core-web-vitals` + `next/typescript`
  (flat arrays, no FlatCompat) with `eslint-config-prettier`; `drizzle/` is eslint-ignored.
- Tests: Vitest, node environment, only `src/**/*.test.ts` (currently unit tests — no DB
  fixtures or services needed).

## Documentation conventions

- For every documentation `.md` file (e.g. `README.md`, `progress.md`, anything under
  `docs/`), add a **table of contents (TOC)** at the top with anchor links to all sections.
  `AGENTS.md` is exempt — it's agent instructions, not documentation.
- **Number headers hierarchically** so the TOC maps to them unambiguously:
  `# 1. Section` → `## 1.1 Subsection` → `### 1.1.1 Detail`. Renumber whenever a section
  is added, removed, or reordered. TOC anchors must match GitHub slugification (dots
  stripped, spaces → hyphens, e.g. `1.1 Foo bar` → `#11-foo-bar`).
- Add **Mermaid diagrams** (`flowchart`, `sequence`, `er`, `state`, `gantt`) wherever one
  illustrates a concept — data flow, CI pipeline, DB schema, git workflow, auth flow —
  and keep the surrounding prose in sync with the diagram.

## Project state

- `progress.md` tracks phase status, locked-in decisions, verification results, and
  current blockers/next steps. Update it whenever you complete a phase or change a
  decision so future sessions can pick up where the last one left off.

## Vercel / env gotchas

- On Vercel, leave `NEXTAUTH_URL` **unset** (empty value breaks `/login` prerender with
  `TypeError: Invalid URL`). NextAuth falls back to `VERCEL_URL`.
- Set `ENABLE_EXPERIMENTAL_COREPACK = 1` so Vercel honors pnpm `11.18.0`; otherwise it
  detects pnpm 10 from the lockfile and ignores the pnpm-11 `allowBuilds` in
  `pnpm-workspace.yaml` (esbuild/sharp/unrs-resolver build scripts).
- `main` → production, `dev` → preview. Copy `.env.example` → `.env.local` for local dev;
  required vars: `DATABASE_URL`, `NEXTAUTH_SECRET`, `ADMIN_INITIAL_PASSWORD` (seeds the
  admin password hash on first run), plus Google service-account vars (still unused while
  the integration is stubbed).
