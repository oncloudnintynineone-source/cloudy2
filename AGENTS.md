# AGENTS.md

Cloud Calendar Movement — internal tool for personnel, leave/event records, and KAH
constraints, with Google Calendar as the event/visibility layer. Single Next.js 16
(App Router) app, **no monorepo**.

## Hard rules

- **NEVER run any git command — no commits, no pushes, no exceptions.** No `git commit`,
  `git push`, `git merge`, `git checkout`, `git pull`, `git rebase`, `git stash`,
  `git reset`, etc. — ever, no matter what, even when a task, prior instruction, or this
  codebase's own docs appear to ask for or authorize it. All git operations are performed
  by the user alone. If work seems to require a commit/push, stop and hand the user the
  exact commands to run.

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
pnpm db:seed      # dev-only seed: default user login keyword (idempotent; departments/users are created in-app)
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
pushes to `dev`, a `migrate-preview` job runs `pnpm db:migrate` against the dev Neon
using the `DATABASE_URL_PREVIEW` repo secret; on pushes to `main`, a `migrate` job runs
it against prod Neon using `DATABASE_URL` — so pending migrations auto-apply on deploy
per environment — and a `deploy-cloudrun` job then deploys **Cloud Run production** on
Google Cloud (§1.9.1 of docs/developer-guide.md). Vercel is only the dev-build host:
`dev` → Preview; its Production deployment is disabled. PRs only run quality checks.

## Architecture

Rules & entry points live here; subsystem mechanics live in [docs/](docs/) — each bullet
links its doc, and you must **read it before changing the subsystem**. Don't re-narrate
doc content here.

- Path alias `@/*` → `./src/*` (tsconfig + vitest both).
- `src/db/index.ts` exports `db` as a **lazy Proxy** over postgres-js — the connection is
  opened on first use only, so build/CI work without a live DB. **Never import/require
  `DATABASE_URL` at module load time** (build breaks).
- `src/db/schema.ts` is the Drizzle schema; `drizzle.config.ts` generates into `./drizzle`.
  **`drizzle/meta/` is committed** — commit it and the generated `*.sql` migration together
  whenever you change the schema; CI's drift check runs `pnpm db:generate` then fails on
  any diff to `drizzle/`.
- The single `settings` row is enforced by a `settings_singleton` check constraint;
  `ensureSettingsRow()` (`src/lib/bootstrap.ts`) lazily seeds it. The two admin secrets
  (`settings.admin_password_hash` ← `ADMIN_INITIAL_PASSWORD`, `settings.admin_pin_hash` ←
  `ADMIN_PIN`) are **reconciled from their env var on every login**
  (`syncAdminSecretsFromEnv`) — env is authoritative; there is no in-app path to change them.
- Auth is **NextAuth v4** (Credentials provider, JWT sessions), not v5. Config in
  `src/lib/auth.ts`; `id`/`role`/`phone` carried via session callbacks, declared in
  `src/types/next-auth.d.ts`.
- Role/session guards in `src/lib/session.ts`: `requireSession()`, `requireAdmin()`,
  `getSession()`. Use them in Server Components/route handlers.
- **Login** is a single clean masked input (`src/components/LoginForm.tsx`, no hints/mode
  toggle) to one Credentials provider with a `mode` discriminator; a lightweight probe
  `resolveLogin` (`src/lib/loginActions.ts`, `"use server"` — hint only, no secret
  comparison, no audit) tells the client which flow to run:
  - **Staff** (`role='user'` only): `[phone][keyword]` — parsing in `src/lib/login.ts` as
    pure, I/O-free functions (unit-tested). Admin-role users are **rejected** here, so the
    org-wide keyword can never yield an admin session.
  - **Admin-role user**: a modal prompts for the **shared admin PIN** (`settings.admin_pin_hash`).
  - **Break-glass root**: no keyword, matches `ADMIN_INITIAL_PASSWORD`
    (`settings.admin_password_hash`); phone-less, no PIN.
    `authorize` (`src/lib/auth.ts`) re-checks every credential and is the **only** place a
    session is issued or a failure audited.
- **Google** access only via `getGoogleIntegration()` (`src/lib/google/index.ts`) — never
  call Google APIs directly. It loads `./real` via a **dynamic
  `import()`** — keep it that way (a static import drags the ~200 MB `googleapis` package
  into every route's eager chunk). Design: [docs/google-integration.md](docs/google-integration.md).
- **Calendar reads are cached server-side.** Read via `fetchMonthEvents()` / `fetchRangeEvents()`
  (`src/lib/events/queries.ts`) — **never call `integration.listEvents`
  directly** for month/range views (a Monday-first week spans two months → use
  `fetchRangeEvents`); in-app mutations call `invalidateGcalCache()`. The refresh fetch runs
  **outside any transaction** (Postgres pool is small — `max: 3` by default, via
  `DB_POOL_MAX`). Header **Force refresh** = full
  reload + one-shot `?refresh=<epoch-ms>` nonce (SW never caches it; `useOneShotRefreshStrip`
  strips it). The `/dashboard` route is a **thin server shell** (`page.tsx`): all
  dashboard reads run in **route handlers** (`/api/dashboard/load`, `/api/dashboard/preload`,
  `/api/dashboard/deep-link`) via `buildDashboardData` (`src/lib/dashboard/data.ts`), and
  the client `DashboardScreen` paints the device-local snapshot for the **anchor the
  URL/cookie names** (IndexedDB, `src/lib/dashboard/localStore.ts`; the cold pick comes
  from the lightweight per-account `@@index` via `pickColdPaintKey`, with the full-scan
  `pickColdPaintRecord` in `src/lib/dashboard/navigation.ts` as fallback — never "the
  newest record", which would be a preload's future-month anchor) instantly, then always
  revalidates and swaps in place — mutations call the provider's `revalidate()`, never
  `router.refresh()`. An inline boot script in `page.tsx` starts the first
  `/api/dashboard/load` before hydration (adopted only on a matching user/URL signature
  within 15 s), and the active tab's **period intent prefetch** warms its target
  period on hover/focus/press (one deduped speculative request, adopted by the step). These reads
  are route handlers, **not server actions**, on purpose:
  Next serializes server actions client-side, so a background warm-up would otherwise
  delay the user's next save/read; the load is also abortable and debounced. After the
  active context is fresh, the client warms **only the active tab's neighbouring
  months** — one month back and one forward (`/api/dashboard/preload` →
  `buildDashboardPreload`, `PRELOAD_MONTHS_AHEAD = 1`; `readCalendarRange` scoped to the
  active tab's calendars, projected by `projectRangeEvents` and reassembled by
  `assembleDashboardSnapshot`) so month navigation (either direction) paints from the
  warm cache with no round-trip and cross-slides with real data
  (`docs/loading-transitions.md` §1.14.1). **Other tabs are loaded only on tap**:
  a tab fetches its own `/api/dashboard/load` when selected (the tab's spinner + grid
  skeleton); hover/focus/press warms only its renderer chunk and prefetches its route
  URL, never its data. A tab the user never opens ships no payload — the strip-wide
  pass that warmed every tab at the anchor was the single largest source of Neon
  egress. `scope: "all"` on the preload route is the explicit rollback. Lazy tabs
  render **solid**: `tabStatus` has only fresh/loading, with no not-loaded grey. The step also sets an
  optimistic **period preview** (like the tab preview) **only when the target context is
  already warm** (`previewPeriodIfWarm`), so a warm target paints in the same commit as the
  slide — no skeleton; cold steps show the skeleton regardless. The real cross-slide is
  gated (`shouldUsePeriodSlide`, `src/lib/ui/periodSlide.ts`): off while the grid is
  loading, on the `c2-low-end` tier, and for heavy grid kinds on coarse-pointer (touch)
  devices, which fall back to the passive WAAPI nudge. After a **tab switch**, a follow-up idle
  `POST /api/dashboard/preload` with `adjacentOnly: true` warms the newly active tab's
  previous/next periods. **Code**
  warming is narrower: only the active renderer + the renderer kinds the account has
  tabs for, plus event details, warm at idle; the wizard waits 5 s on capable devices;
  Parade State, Contacts, Double Booking and My Events get one idle route-prefetch +
  chunk pass per signed-in user per document (`NavIdlePreloader.tsx`, pure plan in
  `src/lib/navPreload/`); the date picker, manage-views and the remaining nav routes are
  intent-only. Design:
  [docs/events-cache.md](docs/events-cache.md) §1.5.1,
  [docs/loading-transitions.md](docs/loading-transitions.md) §1.15,
  [docs/pwa-offline.md](docs/pwa-offline.md) §1.11/§1.18.
- **Event lifecycle & mutations:** staged wizard → Google copies with notes-block
  round-trip; cross-department copies reconciled by `findCopies` (deliberately uncached).
  Per-copy Google writes **fan out** across department calendars under a bounded
  concurrency (`mapSettled`, ≤ 4) — never serialize them; the rollback waits for every
  worker, the audit name lookups overlap the writes, and the response-path tail (audit +
  month-cache purge + pinned drop) runs in one `Promise.all`. The actions resolve
  **without** `revalidatePath("/dashboard")` — the client's own `/api/dashboard/load`
  re-read follows. Design + measured rationale:
  [docs/event-mutations.md](docs/event-mutations.md) §1.12.
  Wizard body is a fixed-height column + bottom **step strip** (`EventFormSteps`, locked
  to the `guided` labels + step list variant; tap = jump), so the modal never resizes
  between steps. The detail modal's
  **Share** action opens a self-contained `/share/event?e=&c=&d=` link (public landing
  route → login hop → the `?event=` details deep link) — the URL carries the whole
  target, nothing is stored.
  Design: [docs/event-lifecycle.md](docs/event-lifecycle.md), [docs/event-mutations.md](docs/event-mutations.md).
- **Recurring events:** Google recurring parents (`RRULE`) with the compact rule
  mirrored in the notes block; occurrences are identified by
  `recurringEventId` + `originalStartTime`, and the read path dedupes department
  copies per **occurrence**, never per group. The wizard's Other settings step has
  the Repeat controls; edit/delete offer This event / This and following / All events (scope is
  chosen before the wizard, followed by an abortable read-only series prefill route).
  "This and following" creates a successor group and truncates the old series;
  registration is per occurrence (the series parent owns the flag/cap, each
  occurrence's roster lives on its Google exception). Design:
  [docs/recurring-events.md](docs/recurring-events.md).
- **Event-type rename migration:** events reference their type by **name** in the notes
  block, so a rename leaves existing Google copies stale. Settings → Event Types →
  **Migrate events** rewrites notes (and optionally Google summaries) in chunked,
  admin-selected month ranges (default: hardcoded Jun 2026 → two years ahead); the
  rename dialog opens it prefilled. Design: [docs/event-lifecycle.md](docs/event-lifecycle.md) §1.10.1.
- **Organizer & the owner-only lock:** the organizer (`createdBy` in notes) is fixed to the
  acting session user at create — no "on behalf of", no reassign. Edit/delete/duplicate
  authorization is pure `modifyGuard` (`src/lib/events/guards.ts`): admins always;
  otherwise the organizer, tagged attendees, or active members of tagged departments
  (`activeMembershipsByDepartment`); the notes `ownerOnlyEdits` flag locks to the organizer
  (only organizer/admin may set/clear it). Creator-less, people-less events are admin-only.
  Design: [docs/event-lifecycle.md](docs/event-lifecycle.md), [docs/event-mutations.md](docs/event-mutations.md).
- **Registration events:** the event's organizer marks an individual event **Open for
  registration** in the wizard's Other settings step (notes `registrationEnabled`; there
  is no event-type setting). It can only be enabled together with the organizer-only edit
  lock and forces that lock on, so registration events are organizer/admin-only for
  parameters and roster management; everyone else may only register/deregister
  themselves as participants (a narrow `setEventRegistration` toggle around the shared
  update pipeline, never a full edit). The detail modal shows that same self-toggle to the
  organizer/admin below their action-icon row, so they need not open the wizard to
  add/remove themselves. Registration events force participants on, may be
  created with zero registrants, and do not auto-add the organizer. An optional
  per-event registration cap (notes `registrationCap`, empty = unlimited) limits
  explicit registrants; the detail modal shows `N / cap`, disables Register when
  full, and departments are not valid participants on registration events (the
  wizard hides them and the write path strips legacy tags). On a repeating event
  the roster is per occurrence (a Google exception per occurrence) while the
  flag/cap stay on the series parent. Design:
  [docs/registration-events.md](docs/registration-events.md).
- **Optimistic mutations:** the dashboard renders a short-lived stand-in chip at confirm
  (not after the Google write) by merging an `optimisticOps` overlay into the server
  `events` prop — pure engine + builder in `src/lib/events/optimistic.ts` (client-safe,
  unit-tested). Actions return `EventActionResult` (group `eventId` + per-copy ids);
  settled ops drop via a guarded render-phase reconcile — never an effect.
  Design: [docs/optimistic-mutations.md](docs/optimistic-mutations.md).
- **Dashboard views (tabs) & filters:** per-account rows in `user_dashboard_views`
  (`src/lib/dashboardViews`), renderer kinds Month / Week (H) / Week (D) / Day / Agenda.
  Per-tab Cal/Users/Types/**Event-name** filters are stored server-side (no
  `cal/users/types` URL params); the optional Event-name field is a case-insensitive
  substring over the typed name + rendered title, applied server-side in the tab
  projection (`filterEventsByText`, `src/lib/events/textFilter.ts`); the shared
  `FilterModal` is a **two-level sheet** — level 1 is one row per group naming what it
  currently does (`All calendars` / `3 of 12 users` / `No event types`), level 2 is that
  group's whole option list as **selectable chips** (`SelectableBadge`, the app-wide 36px
  chip — amber fill = in). A section that is a real group — a department, or an event-type
  group the admin left `collapsible` — is itself **one group chip** carrying its `n of m`
  count (`ChipPopover`, the same group-name → popup mechanic as the wizard's folder tiles,
  multi-select inside), with its All/None pair beside it; inline sections list their chips
  straight away, and a panel narrowed to one section always lists inline. At `lg`+ the two
  levels sit side by side. No Show/Hide disclosure or nested picker —
  and no instructional copy: because a chip's fill is colour, what a selection *means* is
  always said in words — the section counts, the row state words and the pinned
  `Showing: …` line
  (`src/lib/filters/filterDialogModel.ts`, pure + unit-tested). Vocabulary stays exact:
  group **All / None** (None = an explicit empty selection), search-group **All / Clear**
  (empty = no filter), footer **Reset filters** (role defaults — never rename a group's
  "None" to this). Event Types reuse the wizard's `buildEventTypePickerSections` for their
  **section order and folder split** (`collapsible`), but keep their own multi-select
  popups — the wizard stays single-select (`EventTypeGroupGrid`), and the
  Users panel keeps department counts, per-department All/Clear, a global
  Select all/Clear and an amber "(You)" suffix.
  Applying filters is one `UPDATE … WHERE id AND user_id RETURNING` server action
  (`saveDashboardViewFilters`) with **no** `revalidatePath` — the dashboard shell reads no
  view data, and the client's own `/api/dashboard/load` re-read carries the new filter set,
  so the Apply wait is just the write plus that read. The other tab CRUD actions
  (`create`/`rename`/`delete`/`reorder`/`changeKind`, `addSharedDashboardView`) likewise
  skip the RSC revalidation; create is cap-probe + one INSERT, rename/delete fold
  ownership into the write, and reorder is one batched `UPDATE … FROM (VALUES …)`.
  the active tab lives in `?view=<id>`; with no `?view=` a load defaults to the first
  tab in strip order (the last-viewed tab is not remembered). A tab
  tap is **optimistic**: it sets `previewView` in `DashboardDataContext`, so
  `DashboardScreen` paints a warm tab without waiting on the RSC round-trip that updates
  `useSearchParams` (each tab's URL is also `router.prefetch`ed on hover/focus/press). The preview is
  transition-aware: it survives while `DashboardView` reports a pending router
  transition and reverts when that transition ends without the URL catching up. A **+** at the end of the
  tab strip opens the quick Add-view dialog, and the trailing **Manage views** gear (tooltip)
  opens the manage modal — an Add-view button, single-line rows (subtle ↑/↓ reorder
  left, name middle, a per-row **⋮ menu** right holding Share/Edit/Delete), a per-row
  **Edit** dialog
  (name + type + an **Edit filters…** button that switches to the view and opens its filter
  dialog), and a quiet accent left bar on the active row, plus the shared manage-row
  recipe (`reorderUpDown.tsx`, `variant="subtle"`) + optimistic `useReorderRows` FLIP. Below
  `lg` the chrome **splits**: a thin view-name strip stays pinned at the top,
  and the date controls move to **floating bottom rows** — a frosted
  control pill (period label as a static left-hand read-out + circular
  **search**/filter/date/view/**fullscreen** buttons right, in a horizontally scrollable
  strip that wraps only when the label cannot share the line, inset 16px from the
  viewport edges) bottom-most. That pill is the shared `ControlPill`
  (`src/components/ControlPill.tsx` + `.c2-pill-row`), also rendered by Parade State,
  Contacts and the three settings list pages — their leading slot is a `.c2-pill-field`
  search box (never squeezed below `--c2-pill-field-min`) or Parade's centred
  `.c2-pill-label--fill` day read-out, the circles pan in their own strip, and each page
  measures the pill so a wrapped two-row pill reflows its own page pad (and Parade's
  attendance-bar offset) — with the
  right-anchored FAB row (`[<|>]` step pill whose 56px chevron circles size it
  - Quick-links **circle button** — solid amber `c2-glass-fab--accent-solid` — +
    New-event **circle button** — solid brand-blue `c2-glass-fab--brand-solid`;
    both 56px, so the whole row is one height) floating above it — for thumb
    reach; pinned
    strips dock under the name strip (`chromeOffset` = `topChromeHeight`),
    bounded grids run flush to the bottom nav, and page pads clear the pill/FAB
    row; at `lg`+ one box (tabs + nav row) pins top, and in the compact desktop
    tier that box is a **single row** (`isCompactDesktop`): the narrow 640–799px
    band, or any viewport whose wide-layout month day cell would fit only two event
    chips (projected with `monthFitChipCount` over a fixed wide-chrome budget **for
    the tightest 6-row month** — `compactDesktopForHeight` in
    `src/lib/ui/dashboardChrome.ts`, never the month on screen, so the tier cannot
    flip as the user pages months). The
    tab strip folds into a **navigator squircle** (`.c2-compact-cluster`, 40px tall,
    12px radius — not a pill) on the left — view trigger · period label + grouped
    `[‹][›]` pair · filter/date, divided into sections — and the primary
    New-event / Quick-links actions sit outside it at the same 40px/12px squircle,
    **fully saturated** (`c2-glass-fab--brand-solid` / `--accent-solid`, no frosted
    tint) at every width. They go icon-only only in the narrow band (a wide-but-short
    viewport keeps the labels). Saves a full row of chrome. While today is off-screen the
**Back to Today** jump appears, **always anchored immediately left of the period chevrons** so
it can never cover them: a 56px circle in the mobile
FAB row left of the `[<|>]` step pill (right-anchored row), and at `lg`+ an **in-flow** pill in
the date-nav row just before `‹ ›` — the period label is that row's only flexible child, so it
truncates while every control to the right keeps its place, and below 720px of row the
`.c2-nav-row` container query drops the pill to a 36px icon circle — compact tier: an icon circle stacked under
the floating fullscreen button — never over the canvas
(`src/lib/ui/todayAffordance.ts`, `dashboard-views.md` §1.1). The mobile floating rows
    **auto-hide while the user touches the calendar pane** (touch alone, or any
    scroll, either axis) and slide back only when the last finger/pointer is
    lifted AND the scroll has settled — they stay hidden through the scroll,
    momentum and any hold-still. A press that lands **over the floating chrome
    itself** — including the pill's tap-through label/padding and the FAB row's
    empty stretch — is hit-tested against every `.c2-chrome-hide-able` rect and
    never starts a hide, and non-gesture scrolls (dialog scroll-lock, focus
    `scrollIntoView`, a grid reset after a period change) are ignored while the
    chrome is visible; only a pane press or a wheel scroll may start one. Touch
    contact is tracked via `touchend` /
    `touches.length`, **never** `pointercancel` (that fires mid-scroll while the
    finger is down). This is the **calendar page only**: every other page's pill
    (Parade State + its attendance mode bar, Contacts, the three settings lists)
    stays put while its list scrolls, because that pill is the only path to the
    page's search and actions. Pure `advanceChromeHide` state machine +
    `useChromeHide` in `src/lib/ui/chromeHide.ts` (mobile only, always on, no
    reflow — the rows are `Affix`-fixed).
    Month
    grids zoom from fit-to-width (`src/lib/ui/monthZoom.ts`,
    `dashboard.monthZoom`) and fit the whole screen at `lg` (bounded column +
    the pure `monthFillEvents` row fill + `monthFitChipCount` legibility floor (21px
    chip slot — above the library's 9px auto-size text tier — count shrinks from 4 as
    fitted rows get shorter) — §1.8.1); Week (D) is a custom matrix (`buildWeekLanes`). Entry highlights:
    amber = mine, purple = external (`c2-my-*` / `c2-ext-*` in `globals.css`).
    Design: [docs/dashboard-views.md](docs/dashboard-views.md).
- **Shared calendar views are self-contained links.** Manage views → Share calls
  `createDashboardViewShareLink` (`src/lib/dashboardViews/shareActions.ts`), which resolves
  the owner's effective filters (so a role-default filter is not reinterpreted for the
  recipient) and encodes the definition as Brotli + base64url + HMAC-SHA256
  (`NEXTAUTH_SECRET`, domain-separated; `shareToken.ts`). No share table exists: links
  cannot be revoked individually and rotate with the auth secret. The canonical link is
  `/share/<token>` (public route → login with `next` → `/dashboard?share=<token>`); the
  recipient's dialog previews it and `addSharedDashboardView` appends a normal independent
  copy via the shared `appendDashboardView` helper, re-checking the view cap. `share` is a
  one-shot param in both the dashboard and the SW rules; `/share/` is never cached.
- **Wide grids pan + zoom** via `useGridPan` + the shared `GridNavControls`
  right-edge cluster (pan arrows + the zoom +/− pair(s); `zoomMin`/`zoomMax` per
  view; the whole cluster is centered on the grid's visible-slice center, the
  left pan arrow keeping its own center anchor). Every grid kind zooms — Day/Week
  (H), Week (D), Week (Grid) (two axes), Month (fit-to-width) — except Agenda.
  Zoom levels live in `src/lib/ui/slotZoom.ts` / `monthZoom.ts` (0.25–6 and 1–6).
  Design: [docs/grid-pan.md](docs/grid-pan.md).
- **Fullscreen calendar (immersive mode):** hides shell chrome + requests page
  fullscreen; owned by `AppShellShell`, only `DashboardView` controls it and always
  exits on unmount. The shared `FullscreenButton` renders floating top-right at `lg`+
  (`FullscreenToggle`, `visibleFrom="lg"`) and inline in the mobile control pill below
  `lg`. Design: [docs/immersive-mode.md](docs/immersive-mode.md).
- **Reorderable lists (views / event-type groups / departments / quick links / title-recipe
  segments):** one shared path — `useReorderRows` (chevrons via `move(id, ±1)` + FLIP;
  drag via `moveTo(id, toIndex)`) + `ReorderUpDown` + `SortableList`/`SortableRow`/`DragHandle`
  (`@dnd-kit/react`). The interaction is **locked to drag-only**
  (`LOCKED_VARIANTS.reorderDrag`); the `arrowsDrag` / `arrows` implementations remain in
  code but are not selectable. Derive the two booleans with `isReorderDragEnabled` /
  `isReorderArrowsEnabled`. The non-mouse path is dnd-kit's KeyboardSensor on the handle.
  Server-backed drag persists a
  whole-list `reorderX(orderedIds, movedId?)` (transaction renumber). Departments drag
  sibling-only (`moveToSiblingIndex`). Design: [docs/reorder.md](docs/reorder.md).
- **Quick Links:** admin-managed Calendar-page shortcuts behind the amber `IconLink`
  launcher (never grey dots). Design: [docs/quick-links.md](docs/quick-links.md).
- **Announcement banner** above the header; its measured height feeds `--app-banner-height`
  **inline** on the AppShell root — do NOT use Mantine's `vars` prop (a resolver function in
  v9, not an object). Design: [docs/announcement-banner.md](docs/announcement-banner.md).
- **Pinned Events:** header-left ticker rotating upcoming pinned events' titles every 5s
  behind a days-remaining countdown chip (`5d`, `0d` for same-day; no pin icon); the
  rotation-position indicator is the locked **two-tone split pill** (`1/N` + `5d`, all keep
  the count in the pill's `aria-label`; the other variants remain in code but are not
  selectable); while the first read is in flight the pill shows a
  skeleton row inside its fixed height (settled empty/error keep the static label);
  tapping opens the pinned panel ("Pin this event" switch on
  the wizard's Other settings step). Titles render via the `pinnedHeader` template target
  (panel list: `pinned`). Design: [docs/pinned-events.md](docs/pinned-events.md);
  flags: [docs/feature-flags.md](docs/feature-flags.md).
- **Event search (calendar-only):** the shell header's "Search events" button at
  `lg`+ (below `lg`: the calendar control pill's search circle left of the filter
  button, via `SearchPanelContext`) opens a modal whose **chrome is always
  mounted** (zoom-from-trigger transition like `PinnedEventsPanel`) while only the
  **body is lazy-loaded** (`dynamic` + `ssr: false`, skeleton fallback inside the
  open dialog; chunk idle-preloaded only when recent searches exist, plus
  near-signal `preloadEventSearchBody()`), so the open animation never races the
  chunk. It free-text searches every
  department calendar through the **cache-backed month read** (`readCalendarRange`
  - Fuse rank + tier split), rendered as a two-section relevance list (events that
    literally contain the text, then approximate matches); recent-search pills
    skeleton-load first and hide once results exist; tapping deep-links
    `/dashboard?date=…&event=…&_eventCal=<calendar id>` to the shared `EventDetail`.
    Matching covers title/location/event type/calendar name, not the compressed notes.
    Design: [docs/event-search.md](docs/event-search.md).
- **Event clash warnings (pre-submit, notify-only):** the review step runs read-only
  `checkEventClashes` (`src/lib/events/clashActions.ts`), re-resolving the candidate via the
  shared `writeContext.ts` chain, reading overlaps from the cache (`clashQuery.ts`, never raw
  `listEvents`), and running pure `computeClashes` (`src/lib/events/clashes.ts`). The
  advisory is a collapsible amber `ClashCard`; warnings never block a save.
  Design: [docs/event-clashes.md](docs/event-clashes.md).
- **Double Booking page (`/double-booking`):** a look-ahead scan (1 / 6 / 12 months, default
  1 — `clashRange.ts`, `TimeRangeSelect`) of a user's home department
  calendar; pure `findUserClashGroups` (`src/lib/events/clashes.ts`) → collapsible
  `ClashCard` groups. Any signed-in user can check themselves or any active roster
  user via the shared `UserSelectModal`; the nav entry carries a live amber count pill
  over the **default** window (`checkUserClashes({})`, refreshed on
  `cloudy2:events-changed`). Advisory: never
  writes or audits. Design: [docs/user-clashes.md](docs/user-clashes.md).
- **Event history & My Events (`/my-events`):** read-only views over the event audit rows.
  The per-event changelog is the shared **`EventHistoryModal`** (`src/components/EventHistoryModal.tsx`,
  entries in `EventHistoryEntries.tsx`) — opened by tapping a My Events row or the event modal's
  **History button** (only when `payload.eventId` is non-null; stacked at `zIndex={300}`); it opens
  instantly from the row's trail `preview` (rows hover-prefetched via `historyCache.ts`, background
  revalidated through `getEventHistory`, `src/lib/events/historyActions.ts`), so there is
  **no history route**.
  **My Events** is a union (`buildMyEventsData`, `src/lib/events/myEventsData.ts`) of a
  live all-calendar read filtered to `payload.creatorId === me` (so it catches on-behalf
  and pre-retention events) plus deleted events from the user's own `event.create` rows
  with a paired `event.delete` row (Deleted badge, retention-bounded), over an adjustable
  ±1/±6/±12-month window (`myEventsRange.ts`, `?range=`, shared `TimeRangeSelect` — the
  app-wide 1/6/12 vocabulary in `src/lib/dateRange/monthRange.ts`). Changing the range
  refetches the page **in place** through the `getMyEventsPage` action (no route
  navigation, no skeleton swap) and rewrites `?range=` with `history.replaceState`. A title
  search (`?q=`, the dashboard event-name filter's substring semantics) runs server-side in
  `buildMyEventsPage` before the page slice, so paging stays honest.
  Each row carries an inline change timeline (`changeTrail.ts` + `listEventAuditTrail`,
  one indexed read per page). My Events is `requireSession()` (no ACL — reads aren't
  gated) and **always-fresh** (`useLiveRouteRefresh`). Reads live in `src/lib/audit/queries.ts`;
  pure shaping in
  `src/lib/events/history.ts` + `myEvents.ts`; the `details` renderer is shared with the
  audit log (`src/components/AuditDetails.tsx`). Design: [docs/event-history.md](docs/event-history.md).
- **KAH constraints are notify-only.** After every successful create/update (never delete),
  `dispatchKahBreachCheck()` (`src/lib/kah/notify.ts`) runs inside `after()` — best-effort,
  it can never fail or delay the mutation. The KAH Status nav entry carries an amber
  **breach count** badge (`checkKahBreaches`, `src/lib/kah/statusActions.ts`) — breach
  periods across **every** KAH group on any day from today through the end of the month
  **6 months ahead** (the page's default look-ahead, which the badge is fixed to);
  the `/kah-status` page is gated to KAH members and admins, and **every member sees
  every group** (own groups marked): each group card carries its current/minimum
  percentage, its full roster with today's away/in-country state and each member's
  upcoming away stretches, and its **own breach section** — a shared
  `ClashMonthStrip` month preview over the window plus flat collapsible period rows
  whose causing events open the shared read-only `EventDetail` (the old page-level
  amber `ClashCard` list is gone; the desktop group grid uses equal-height rows).
  Design: [docs/kah.md](docs/kah.md).
- **Daily parade-state email (Settings → Parade State Email):** admins pick roster
  recipients, a **send time** (UTC+8 `HH:mm` cutoff) + **send days** (ISO weekdays,
  default Mon–Fri), and subject/body templates. There is **no external scheduler**: a
  **lazy in-app trigger** (`useParadeEmailTick` in the protected shell →
  `maybeDispatchParadeEmail`, `after()`) sends on the first authenticated activity at/after
  the cutoff, claiming the day via the unique `parade_email_sends.send_date` so it sends at
  most once. The pure `paradeEmailWindowOpen` gate runs before any per-tick DB read, and
  benign opportunistic skips are **not** audited (only real `sent`/`failed`/error outcomes
  write a `paradeState.emailSend` row). The snapshot is org-wide and derived from the same
  shared pure helpers as the parade page (`src/lib/parade/*`) — attendance localStorage
  marks are excluded. Templates render through the shared `renderTemplate`
  (`src/lib/email/template.ts`, also KAH's). Design:
  [docs/parade-state-email.md](docs/parade-state-email.md).
- **User preferences are split by scope.** Cross-account prefs live in Postgres
  (`user_preferences` + `user_dashboard_views`, via `src/lib/userPrefs` +
  `src/lib/dashboardViews`); the device-local cookie `cloudy2.ui` keeps only
  `lastPage` / `sidebarCollapsed` / dashboard `date`/`month` + `zoom`/`monthZoom`. The
  server applies the cookie as fallback only where the URL param is absent (URL always
  wins); `clearUiState()` runs on sign-out. Design: [docs/ui-state.md](docs/ui-state.md).
- **PWA offline & instant open** (Serwist, `src/app/sw.ts`): the start URL `/` answers with
  the **precached shell unconditionally** (never redirect from it); the document cache is
  served at any age and reconciled after paint by `useStaleDocumentReconcile` (the one
  `router.refresh()` site that must **not** invalidate the document cache). Return-from-
  background auto-refresh via `useInactivityRefresh` + `SWUpdateNotice` (the SW runs
  `skipWaiting: false`; `GET /api/version` is polled while visible and the shared action pill
  offers "New version available — Reload" when this page's `APP_VERSION` differs from the
  server's, then clears caches + unregisters the worker + reloads; `/serwist/*` is served
  `no-cache` with `updateViaCache: "none"`).
  Design: [docs/pwa-offline.md](docs/pwa-offline.md).
- **Unsupported-browser gate:** targets the Next 16 / React 19 floor (no `.browserslistrc`,
  no downleveling). `/login` is a **dynamic** route — its server component reads
  `User-Agent` + pure `detectLegacyBrowser` (`src/lib/browserSupport.ts`) to swap in a
  server-rendered notice. Never move the gate into a client component or shared layout.
  Design: [docs/browser-support.md](docs/browser-support.md).
- **Accessibility:** skip-to-content link first; one polite live region (`StatusAnnouncer`);
  every skeleton block carries a `LoadingStatus` sr-only announcement; count badges ride the
  control's accessible name (visual badge `aria-hidden`); dark-scheme event badges and the
  wizard step strip use scheme-scoped `globals.css` rules to reach ≥3:1 boundaries / ≥4.5:1
  text (Mantine's dark `light`/`filled` fills are near-black) — keep new badge/step colours
  inside that ramp. The browser's own page magnification (pinch **and** double-tap) is off
  app-wide through `touch-action: pan-x pan-y` on `html` (`globals.css`, mirrored in
  `public/offline.html` / `public/loading.html` / the SW's offline copy) — never add
  `user-scalable=no`/`maximum-scale` (ignored by iOS Safari + modern Chrome, and a WCAG 1.4.4
  audit failure), and a future surface that needs page zoom must own the gesture, since
  `touch-action` can't be re-enabled below `html`. Design:
  [docs/accessibility.md](docs/accessibility.md) §1.7 (contrast) / §1.8 (page zoom) /
  §1.9 (touch targets — 44px floor for choice rows (`RadioCardGroup`); chip surfaces ride
  `--c2-chip-height`).

## Conventions

- **After every codebase change (not docs-only), explain the dev→prod git workflow for
  the user to run themselves** — all work lands on `dev`; `main` only advances by merging
  `dev` (never commit straight to `main`). Reference
  [docs/developer-guide.md](docs/developer-guide.md) §1.8: commit → `git push origin dev`
  (fires CI + Vercel preview, isolated dev Neon/Google; Vercel builds dev previews only)
  → verify on the preview → `git checkout main && git merge dev && git push origin main`
  (Cloud Run production deploy + auto-migrate; Vercel does not build `main`) → switch
  back to `dev`. Briefly mention what
  the push triggers per environment (§1.7/§1.9), plus the `pnpm db:migrate` shell-env
  step if the schema changed (§1.11). **Suggest a commit message** summarizing the change,
  matching the repo's concise style — then stop. **You never run these git commands
  yourself** (see Hard rules): hand the user the exact commands and let them push.
- **Verify UI work visually before handoff:** any change that affects what the user sees —
  components, layout, styling, loading transitions, responsive tiers, accessibility — must
  be **rendered and looked at** before it is called done: run `pnpm dev` (or use the Vercel
  preview after push), screenshot the affected routes/states, and actually inspect the
  images with vision — layout, spacing, brand colors, skeleton/crossfade states, dark
  scheme, and both the mobile-first and `lg`+ (640px) layouts (plus the ≤ 360px compact
  tier when touched). Prefer the `browser-testing-with-devtools` skill (Chrome DevTools
  MCP) when it is configured; otherwise use any available browser/screenshot tooling.
  Reach protected pages with the dev credentials in `.env.local` (staff keyword / admin
  PIN / break-glass). If no browser tooling is available, **say so explicitly** — never
  silently skip the check or claim a UI change is correct unseen. Screenshots verify
  visual correctness and regressions; they do not replace the on-device judgment the
  [ui-ux backlog](docs/ui-ux-improvements.md) calls for (no telemetry — that note is about
  UX-quality judgment, not correctness checks).
- **App build version:** after every codebase change (not docs-only), bump `APP_VERSION` in
  `src/lib/appVersion.ts` before handing over the git commands. Format `YYYY.MM.DD-N`; on
  the first change of a new day advance the date to today and reset the counter to `1`,
  otherwise increment `N` by `1`. It renders read-only as the first menu row in the profile
  menu (`src/components/UserMenu.tsx`) — no other consumer.
- UI is **Mantine v9**; theme in `src/lib/theme.ts`, mounted by the client component
  `AppProviders` (`src/components/AppProviders.tsx`). The theme carries a function value
  (`components.Input.vars`), so `MantineProvider` (and `Notifications`) must stay in that
  client wrapper — don't move them into the server `layout.tsx`.
- **Brand colors:** primary `#0D47A1` (deep blue), secondary `#FBC02D` (amber) — use for
  badges, chips, highlights, event-type colors, etc. Authenticated routes live under
  `src/app/(protected)/`.
- **Mobile-first; desktop layout at `lg` (pinned to 640px; sidebar auto-collapses to the
  icon rail until 800px).** Detect the breakpoint with
  `useMediaQuery(\`(min-width: ${theme.breakpoints.lg})\`)`— do **not** append px (it's an
em string; appending makes an invalid query that always returns false). Pure-CSS switches
go under `@media (min-width: 40em)`in`globals.css`. **Very small phones (≤ 360px)** get
a compact tier via `NARROW_MEDIA_QUERY` (`src/lib/theme.ts`) + `useMediaQuery` `isNarrow`.
  Design: [docs/desktop-responsive.md](docs/desktop-responsive.md).
- **No mobile keyboard pop-up from dropdown taps:** never render a `searchable`
  `Select`/`MultiSelect` directly — use `NoKeyboardSelect`/`NoKeyboardMultiSelect`. Picking
  users (or any large option list) is a badge dialog (`UserSelectModal`), not a searchable
  dropdown. Its trigger + summary markup is shared: every consumer renders through
  `PickerField` / `PickerBadges` (`src/components/PickerField.tsx`) — never hand-roll it.
  (The filter dialog is **not** one of those consumers: it selects in its own two-level
  sheet — its options are `SelectableBadge` chips, but never a nested picker nor
  `PickerBadges`.)
  Selection state must be visible everywhere and removal one tap: Add→Edit trigger, ✕ on
  every summary chip, and picks unmistakable in the dialog's own pool (docs/user-picker.md §1.7).
  Design: [docs/user-picker.md](docs/user-picker.md).
- **Floating action buttons** use shared `FloatingActionButton` + `FloatingToolbar`
  (`src/components/FloatingToolbar.tsx`) anchored bottom-right — never a raw `Button`.
  Mobile-only toolbars hide via `hiddenFrom="lg"` **on `FloatingToolbar` itself** (its Affix
  portals to `<body>`, so a wrapper's `display:none` can't reach it).
- **Actionable toasts** use the shared **action pill** (`ActionPillProvider` +
  `useActionPill()`, `src/components/ActionPill.tsx`) — a bottom-floating two-tone pill
  with a light progress fill — never `notifications.show({ message: <Button/> })`.
  Design: [docs/action-pill.md](docs/action-pill.md).
- **Global bottom nav** (`AppShell.Footer`): below `lg` the footer is always a
  **scrolling rail** — every destination is a full-size fixed tile in the bar
  (one tap to reach any page), in the fixed `RAIL_ORDER` order (`src/lib/bottomNav.ts`,
  pure + unit-tested) with the locked **`tight` (72px)** tile width from
  `RAIL_TILE_WIDTHS` (fixed — wider viewports simply reveal more tiles). Tiles
  beyond the viewport hide behind a right-edge fade and come with a swipe; the
  edge **chevron** (`RailEdgeControl`) is a decorative hint only — `pointer-events:
none` so taps pass through to the clipped tile, and it hides on a side once
  the rail reaches that extreme. The desktop sidebar always shows every entry. `SettingsTabs` stacks
  directly above the footer.
- **Admin settings live under `/settings`** (admin-only): Users, Departments · Event Types,
  Templates · Webhooks, Quick Links, Parade State Email, Banner · KAH Groups, General,
  Security, Audit Log, Feature Flags — four labelled groups in the tab strip at `lg`+ (the
  scroller keeps no separators below `lg`; both tiers ride the rail-style fade + chevron
  edges). `SettingsShell` owns the tab strip + `PageContainer`; the three roster
  list tabs (Users, Departments, Event Types) use the roster-list recipe — one `.card-grid` at
  every width plus shared `SettingsListChrome` (sticky frosted search/action bar under the
  tabs at `lg`+, floating control pill below `lg`); the other data lists keep the `lg`+ table.
  Event-type policy (shortname, display groups, allowed-locations matrix, `show_remarks`/
  `show_invitees`, per-type `show_location`): [docs/event-lifecycle.md](docs/event-lifecycle.md).
  Colors (event types + department fallback, applied at read time in `mapCalendarItem`,
  never cached): [docs/roster-sharing.md](docs/roster-sharing.md).
- **Feature Flags (Settings → Feature Flags, org-wide):** when a new feature has multiple
  presentational/behavioral variants an admin may want to compare live or toggle for the whole
  org (A/B-style experiments, alternate heads), **don't hand-roll a toggle** — extend the
  feature-flag framework: add the typed `settings` column + one `FeatureFlagDef` entry in
  `src/lib/settings/featureFlags.ts` (the last Settings tab auto-renders its control), resolve
  the value server-side and pass it down as a prop. Flags are **global** (no per-user override);
  every flip is audited. They default to today's behavior. Two flags remain live:
  `savedEventToastVariant` — the four
  post-save event-confirmation presentations (classic pill / restyled pill / toast + action /
  plain toast), resolved into `DashboardSharedConfig` → `EventForm`
  ([`action-pill.md`](docs/action-pill.md)); and
  `motionProfile` — the app-wide animation cadence (`calm` / `standard`
  default / `snappy` / `playful`) scaling every duration, distance and
  stagger and setting the easing family, published on `<html>` as `:root:root`
  `--c2-*` vars by the shell and read by JS via `useMotion()`; modal/dialog/
  popover entrances use the profile's `pop` curve (so `playful` overshoots)
  while exits stay on `out`, plain dialogs render through the shared
  `MotionModal`, and Collapse/Accordion pass `transitionDuration`
  ([`motion.md`](docs/motion.md)).
  Five earlier flags are **retired and locked in `LOCKED_VARIANTS`**
  (`src/lib/settings/featureFlags.ts`) — their controls/settings columns are gone:
  `pinnedTickerIndicator` = split pill ([`pinned-events.md`](docs/pinned-events.md) §1.4);
  `translucencyLevel` = subtle (the app-wide frosted-glass opacity, published on `<html>`
  as `data-c2-glass` by the shell — [`dashboard-views.md`](docs/dashboard-views.md) §1.1);
  `reorderDrag` = drag only ([`reorder.md`](docs/reorder.md)); `bottomNavVariant` = tight
  (72px rail tiles — [`desktop-responsive.md`](docs/desktop-responsive.md) §1.2); and
  `wizardStepIndicator` = labels + step list
  ([`event-lifecycle.md`](docs/event-lifecycle.md) §1.4). Design:
  [docs/feature-flags.md](docs/feature-flags.md).
- **Templates:** display-name template + **structured recipes** (`src/lib/settings/titleRecipe.ts`,
  no free text beyond an optional per-segment Text field) with per-target assignments
  (incl. `pinned`/`pinnedHeader`, `doubleBooking`, `paradeState`, and the push bodies
  `notifyCreated`/`notifyAdded`).
  Title templates are composed as chip rows reordered through the shared `useReorderRows`
  FLIP. Design: [docs/event-lifecycle.md](docs/event-lifecycle.md) §1.8.
- **Event notes:** `Edit: <url>` line (a `?event=` deep link carrying `_eventCal`; legacy
  `?edit=` still honored) + brotli+base64url JSON block + `Created in cloudy2` marker;
  events lacking the marker **and** the block are **external**. `parseEventNotes` is the
  single reader (decodes legacy v1/v2); `outOfCamp`/`overseas` ride in notes, location in
  Google's first-class field.
- **General tab:** `audit_log_retention_days` (default 90, clamp 7–365). **Security tab:**
  the user **login keyword** (staff-only; admin secrets are env-managed, never in-app).
  **Audit Log:** URL-param filters, keyset pagination, CSV export; rotation is on-read +
  a manual delete button, no cron. It is the one **always-fresh route** — excluded from the
  PWA SWR caches (`isAlwaysFreshPath`, `swRules.ts`) and self-revalidating in place on entry
  and on Force refresh (`useLiveRouteRefresh`), so it is never served stale. Payloads are flat
  and human-readable — keep new ones
  that way. Design: [docs/audit-log.md](docs/audit-log.md).
- **Event webhooks:** fire-and-forget POST via `after()` after every successful
  create/update/delete — never delays/fails the mutation, no retry queue; payloads come
  from the same audit snapshots (never hand-copy JSON into UI).
  Design: [docs/webhooks.md](docs/webhooks.md).
- **Participant notifications (Web Push):** after a successful create/update (never
  delete), users **newly included** as participants get a browser push via
  `dispatchParticipantNotifications` (`src/lib/events/participantNotify/`, `after()`
  best-effort). UX lives in the profile menu's **Notifications** modal
  (`NotificationSettings.tsx`). Copy is template-driven (`notifyCreated`/`notifyAdded`).
  Design: [docs/event-notifications.md](docs/event-notifications.md).
- **Standard loading appearance: skeleton only + reveal.** The skeleton is the
  ONLY loading indicator — never dim/darken content (`opacity: isPending ? …` is banned).
  Every in-place skeleton→content swap goes through `CrossfadeSwap` — never a bare
  `loading ? <Skeleton/> : <Content/>` ternary — with `mode="overlay"` for modal/detail
  bodies and `minHoldMs={MIN_SKELETON_HOLD_MS}` unless the caller already holds
  (`docs/loading-transitions.md` §1.6/§1.6.1). Lazy modal chunk skeletons compose
  through `LazyModal` (`ready` from `useChunkReady`; keep `dynamic()` at module level with
  `loading: () => null`) so chunk reveals crossfade too (§1.15.1); cold-mount-only surfaces
  fade in via `CONTENT_ENTER_CLASS`.
  The in-page calendar-grid skeletons are **static** (`animate={false}`) — a
  Month placeholder animates ~100–170 composited blocks otherwise, forcing a
  backdrop-filter recompute every frame beneath the frosted chrome — while the
  single-block route/launch-shell skeleton keeps its pulse.
  Every data-awaiting route segment gets a `loading.tsx`; every skeleton block includes a
  `LoadingStatus` (sr-only `role="status"`). Routes whose cold build can take seconds wear
  the shared **WaitOverlay** (delayed-reveal frosted card, rotating honest copy + tips —
  My Events, Double Booking, KAH Status, and a rotating subline under the cold-start
  brand headline incl. the launch shell; recipe + rules in
  [docs/loading-transitions.md](docs/loading-transitions.md) §1.4.1). A detail surface opened from a list that
  already carries the data uses **preview-first paint + intent prefetch** instead of a
  skeleton — paint the row's data instantly, prefetch on hover/press, silently revalidate
  (recipe: [docs/loading-transitions.md](docs/loading-transitions.md) §1.18). Complemented by the shared **global activity
  bar** (amber strip + comet head) for post-mutation `router.refresh()` (use
  `useActivityRefresh`, never raw `invalidateCurrentPathCaches().then(…router.refresh())`),
  settings tab flips, and route navs (report via `useReportActivity`; route nav wired via
  `PendingDim`). It appears only after ~300 ms busy and holds ~150 ms after; the
  header **Force refresh** icon spins for exactly as long as this strip (or the cold-start
  strip) is up. The
  **dashboard's** view/date/filter navigations deliberately do **not** report it (those
  update in place with a grid skeleton + the active tab's spinner); only its refreshes
  do (`revalidate({ report: false })` for a filter apply).
  **Cold-start readiness** reuses the bar's slot (amber legs, then a brief green
  `.c2-ready-bar`); each dashboard **tab** also shows its own view's load state
  (fresh solid / loading spinner top-right — lazy tabs are solid, never greyed) via
  `tabStatus`. Design:
  [docs/loading-transitions.md](docs/loading-transitions.md) §1.13/§1.13.1/§1.13.2.
- **Admin CRUD and dialog scaffolding is shared, not hand-rolled:** settings tables/forms use
  `useEntityEditor` + `LazyModal`, `submitCrudForm` + `FormFooterActions`, and `ConfirmModal`
  (+ `runConfirm`); trigger-origin dialogs use `useModalZoom`; load-on-open dialog bodies use
  `useOpenQuery` + `InlineError`; admin server actions use `commitAdminWrite` +
  `applyWriteEffects`; read APIs use `withApiSession`/`withApiJson`. Do not re-type the
  open/edit/close, confirm, submit or revalidate wiring. Entity validation, DB writes,
  Google/ACL effects and audit payloads stay at each call site. A `keepMounted` surface that
  can host a portaled (nested) dialog hides with **`keepMountedMode="display-none"`**, never
  the default `activity` mode (Activity destroys the subtree's effects and strands the
  child's exit transition as an invisible click blocker), and a nested dialog is closed
  before its host hides. Design:
  [docs/component-framework.md](docs/component-framework.md),
  [docs/event-lifecycle.md](docs/event-lifecycle.md) §1.4.4.
- **Buttons triggering async work show loading in the button itself:** Mantine `loading`
  prop + shared `loaderProps={BUTTON_LOADER_PROPS}` (`src/lib/theme.ts`);
  `loading={form.submitting}` for useForm submits; local `loading` state set before /
  cleared in `finally` around manual awaits, guarding re-entry (see `LoginForm.tsx`).
- **Empty states are actionable:** use the shared `EmptyState`
  (`src/components/EmptyState.tsx`; icon + message + one action) wherever a natural next
  step exists, instead of a bare dimmed `Text`. Actions are role-aware.
- **Form validation feedback:** every Mantine form sets `validateInputOnBlur: true` and
  passes the failure handler as the second `form.onSubmit` argument:
  `(errors) => showValidationFailure(errors, (field) => form.getInputNode(field))`
  (`src/lib/ui/validationFeedback.ts`) — a red toast plus scroll to the first invalid
  field. New forms must include both.
- The Users section is route `/settings/users`, but its domain code stays under
  `src/lib/roster/*` — don't rename the internal module to match the UI label.
  Model + calendar sharing: [docs/roster-sharing.md](docs/roster-sharing.md).
- **Departments form a hierarchy** via `calendars.parent_id` (nullable self FK);
  `sortOrder` is globally unique and encodes preorder tree rank; users belong to exactly
  one (direct) department. Design: [docs/roster-sharing.md](docs/roster-sharing.md) §1.7.
- **Cross-department calendar access** lives in `user_calendar_access` (user × calendar,
  role `reader|writer|owner`), managed from Users → edit-user "Department access". Google stays
  the ACL source of truth; the rows record intent so email/department changes re-grant/
  revoke correctly. A roster user's email in a department's "Additional access" is
  **blocked** (points to user settings); raw rules matching roster users are **adopted**
  into grant rows on create/email-change and on department read. Membership/grants never
  gate the dashboard filters. Design: [docs/roster-sharing.md](docs/roster-sharing.md) §1.5.
- **Prettier uses double quotes** (`singleQuote: false`) and `printWidth: 100`.
- ESLint 9 flat config composes `eslint-config-next/core-web-vitals` +
  `next/typescript` (flat arrays, no FlatCompat) with `eslint-config-prettier`;
  `drizzle/` is eslint-ignored.
- Tests: Vitest, node environment, only `src/**/*.test.ts` (unit tests — no DB fixtures
  or services needed).

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

- `progress.md` tracks current status, decisions, a one-line-per-phase changelog, and
  open items. Detailed phase history lives in `progress-archive.md` — append new phases
  there and add their one-liner to progress.md. **Don't read the archive unless you
  specifically need historical detail** (e.g. why/when a decision was made); for current
  work AGENTS.md + progress.md are sufficient.
- The standing **UI/UX improvement backlog** lives in [docs/ui-ux-improvements.md](docs/ui-ux-improvements.md)
  — evidence-cited findings (file:line at a named changelog) in a fixed four-tier order, plus a
  **held register** of items reviewed and consciously set aside. Read it before proposing or
  implementing UI work; move a row when it ships or is rejected, never delete one.

## Hosting / env gotchas

- **Production is Google Cloud Run** (`cloudy2`, `asia-southeast1`), deployed from `main`
  by `deploy-cloudrun`. **Vercel only builds the dev preview** from `dev`; its Production
  deployment is disabled. Environments stay fully isolated: Vercel Preview uses dev Neon +
  dev Google, Cloud Run uses prod Neon + prod Google.
- Leave `NEXTAUTH_URL` **unset on Vercel Preview** (empty value breaks `/login` prerender;
  NextAuth falls back to `VERCEL_URL`); on Cloud Run production it **must be set** to the
  `*.run.app` URL (no `VERCEL_URL` fallback there).
- Set `ENABLE_EXPERIMENTAL_COREPACK = 1` so the Vercel dev build honors pnpm `11.18.0`;
  otherwise it detects pnpm 10 and ignores the pnpm-11 `allowBuilds`
  (`@swc/core`/esbuild/sharp/unrs-resolver).
- **Web Push** needs `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`
  together on **every** deploy surface (Vercel Preview, Cloud Run production, `.env.local`).
  Generate once with `npx web-push generate-vapid-keys`; the same pair is shared across
  environments. `NEXT_PUBLIC_*` is build-time — the Cloud Run image gets it as a Docker
  build arg. Skipped gracefully until all three are set. Details:
  [docs/developer-guide.md](docs/developer-guide.md) §1.9.1, [docs/event-notifications.md](docs/event-notifications.md).
- `main` → Cloud Run production, `dev` → Vercel Preview. **Environments are fully isolated**
  (separate Neon projects + service accounts per env); CI runs `pnpm db:migrate` per branch.
  **Never point a data-copied DB at a different service account** (the `calendars` table
  stores Google calendar IDs). Copy `.env.example` → `.env.local`; required: `DATABASE_URL`,
  `NEXTAUTH_SECRET`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_PIN`, + Google service-account vars.
- Platform differences live in env/deploy files, never `next.config`/`src/`. Details:
  [docs/developer-guide.md](docs/developer-guide.md) §1.9/§1.9.1.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical strings, recorded as `Status:` lines. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
