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
per environment — and a `deploy-cloudrun` job then deploys the Cloud Run shadow
(§1.9.1 of docs/developer-guide.md). PRs only run the quality checks.

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
  dashboard reads moved into the `loadDashboardData` server action via
  `buildDashboardData` (`src/lib/dashboard/data.ts`), and the client `DashboardScreen`
  paints the last **device-local snapshot** (IndexedDB, `src/lib/dashboard/localStore.ts`)
  instantly, then always revalidates and swaps in place — mutations call the
  provider's `revalidate()`, never `router.refresh()`. After the active context is fresh,
  the client **preloads every tab** for the current anchor (`preloadDashboardTabs` →
  `buildDashboardPreload`: one union `readCalendarRange` + per-tab `projectRangeEvents`
  delta, reassembled by `assembleDashboardSnapshot`) so tab switches paint from the warm
  cache with no round-trip. Design:
  [docs/events-cache.md](docs/events-cache.md) §1.5.1, [docs/pwa-offline.md](docs/pwa-offline.md) §1.11/§1.18.
- **Event lifecycle & mutations:** staged wizard → Google copies with notes-block
  round-trip; cross-department copies reconciled by `findCopies` (deliberately uncached).
  Wizard body is a fixed-height column + bottom **step strip** (caption + non-wrapping
  Stepper, tap = jump), so the modal never resizes between steps.
  Design: [docs/event-lifecycle.md](docs/event-lifecycle.md), [docs/event-mutations.md](docs/event-mutations.md).
- **Organizer & the owner-only lock:** the organizer (`createdBy` in notes) is fixed to the
  acting session user at create — no "on behalf of", no reassign. Edit/delete/duplicate
  authorization is pure `modifyGuard` (`src/lib/events/guards.ts`): admins always;
  otherwise the organizer, tagged attendees, or active members of tagged departments
  (`activeMembershipsByDepartment`); the notes `ownerOnlyEdits` flag locks to the organizer
  (only organizer/admin may set/clear it). Creator-less, people-less events are admin-only.
  Design: [docs/event-lifecycle.md](docs/event-lifecycle.md), [docs/event-mutations.md](docs/event-mutations.md).
- **Optimistic mutations:** the dashboard renders a short-lived stand-in chip at confirm
  (not after the Google write) by merging an `optimisticOps` overlay into the server
  `events` prop — pure engine + builder in `src/lib/events/optimistic.ts` (client-safe,
  unit-tested). Actions return `EventActionResult` (group `eventId` + per-copy ids);
  settled ops drop via a guarded render-phase reconcile — never an effect.
  Design: [docs/optimistic-mutations.md](docs/optimistic-mutations.md).
- **Dashboard views (tabs) & filters:** per-account rows in `user_dashboard_views`
  (`src/lib/dashboardViews`), renderer kinds Month / Week (H) / Week (D) / Day / Agenda /
  Month & Agenda (Month + Agenda side by side, resizable; day-anchored, `src/lib/ui/dualSplit.ts`).
  Per-tab Cal/Users/Types filters are stored server-side (no `cal/users/types` URL params);
  the active tab lives in `?view=<id>`; with no `?view=` a load defaults to the first
  tab in strip order (the last-viewed tab is not remembered). A tab
  tap is **optimistic**: it sets `previewView` in `DashboardDataContext`, so
  `DashboardScreen` paints a warm tab without waiting on the RSC round-trip that updates
  `useSearchParams` (each tab's URL is also `router.prefetch`ed). A **+** at the end of the
  tab strip opens the quick Add-view dialog, and the trailing **Manage views** gear (tooltip)
  opens the manage modal — an Add-view button, subtle ↑/↓ reorder, a per-row **Edit** dialog
  (name + type + an **Edit filters…** button that switches to the view and opens its filter
  dialog), delete, and a quiet accent left bar on the active row, plus the shared manage-row
  recipe (`reorderUpDown.tsx`, `variant="subtle"`) + optimistic `useReorderRows` FLIP. Below
  `lg` the prev/next period chevrons leave the nav row and join the bottom-right FAB cluster
  (`[<][>][LINK][CREATE]`, frosted glass via `.c2-glass-fab`) for thumb reach; both sets share
  the view-aware `navigatePeriod`.
  Month
  grids zoom from fit-to-width (`src/lib/ui/monthZoom.ts`,
  `dashboard.monthZoom`); Week (D) is a custom matrix (`buildWeekLanes`). Entry highlights:
  amber = mine, purple = external (`c2-my-*` / `c2-ext-*` in `globals.css`).
  Design: [docs/dashboard-views.md](docs/dashboard-views.md).
- **Wide grids pan + zoom** via `useGridPan` + the shared `GridNavControls`
  right-edge cluster (pan arrows + the zoom +/− pair(s); `zoomMin`/`zoomMax` per
  view). Every grid kind zooms — Day/Week (H), Week (D), Week (Grid) (two axes),
  Month (fit-to-width) — except Agenda. Zoom levels live in
  `src/lib/ui/slotZoom.ts` / `monthZoom.ts` (0.25–6 and 1–6).
  Design: [docs/grid-pan.md](docs/grid-pan.md).
- **Fullscreen calendar (immersive mode):** hides shell chrome + requests page fullscreen;
  owned by `AppShellShell`, only `DashboardView` controls it and always exits on unmount.
  Design: [docs/immersive-mode.md](docs/immersive-mode.md).
- **Reorderable lists (views / event-type groups / departments / quick links / title-recipe
  segments):** one shared path — `useReorderRows` (chevrons via `move(id, ±1)` + FLIP;
  drag via `moveTo(id, toIndex)`) + `ReorderUpDown` + `SortableList`/`SortableRow`/`DragHandle`
  (`@dnd-kit/react`). The interaction is the **`reorderDrag` feature flag** — `drag`
  (default, handle only), `arrowsDrag` (both), or `arrows` (chevrons only); derive the two
  booleans with `isReorderDragEnabled` / `isReorderArrowsEnabled`. In `drag` mode the
  non-mouse path is dnd-kit's KeyboardSensor on the handle. Server-backed drag persists a
  whole-list `reorderX(orderedIds, movedId?)` (transaction renumber). Departments drag
  sibling-only (`moveToSiblingIndex`). Design: [docs/reorder.md](docs/reorder.md).
- **Quick Links:** admin-managed Calendar-page shortcuts behind the amber `IconLink`
  launcher (never grey dots). Design: [docs/quick-links.md](docs/quick-links.md).
- **Announcement banner** above the header; its measured height feeds `--app-banner-height`
  **inline** on the AppShell root — do NOT use Mantine's `vars` prop (a resolver function in
  v9, not an object). Design: [docs/announcement-banner.md](docs/announcement-banner.md).
- **Pinned Events:** header-left ticker rotating upcoming pinned events' titles every 5s
  behind a days-remaining countdown chip (`5d`, `0d` for same-day; no pin icon); the
  rotation-position indicator is the **`pinnedTickerIndicator` feature flag** (Settings →
  Feature Flags, org-wide, default `classic`) — inline amber `1/N` chip, a two-tone
  `1/N`+`5d` split pill, bottom segmented rotation bar, corner count badge, or a stacked
  `1/N`-over-`5d` block (all keep the count
  in the pill's `aria-label`); tapping opens the pinned panel ("Pin this event" switch on
  the wizard's Other settings step). Titles render via the `pinnedHeader` template target
  (panel list: `pinned`). Design: [docs/pinned-events.md](docs/pinned-events.md);
  flags: [docs/feature-flags.md](docs/feature-flags.md).
- **Event search:** header icon opens a **lazy-loaded** (`dynamic` + `ssr: false`) modal
  that free-text searches every department calendar **directly via Google Calendar**
  (`events.list` `q` — bypasses the month cache), rendered in `@mantine/schedule`'s
  `AgendaView`; tapping deep-links `/dashboard?date=…&event=…&_eventCal=<calendar id>` to
  the shared `EventDetail`. `q` matches `summary`/`location`/`description`, not the
  compressed notes. Design: [docs/event-search.md](docs/event-search.md).
- **Event clash warnings (pre-submit, notify-only):** the review step runs read-only
  `checkEventClashes` (`src/lib/events/clashActions.ts`), re-resolving the candidate via the
  shared `writeContext.ts` chain, reading overlaps from the cache (`clashQuery.ts`, never raw
  `listEvents`), and running pure `computeClashes` (`src/lib/events/clashes.ts`). The
  advisory is a collapsible amber `ClashCard`; warnings never block a save.
  Design: [docs/event-clashes.md](docs/event-clashes.md).
- **Double Booking page (`/double-booking`):** a 30-day scan of the user's own department
  calendar; pure `findUserClashGroups` (`src/lib/events/clashes.ts`) → collapsible
  `ClashCard` groups. Admins can scan any active roster user via the shared
  `UserSelectModal`; the nav entry carries a live amber count pill (`checkUserClashes({})`,
  refreshed on `cloudy2:events-changed`). Advisory: never writes or audits.
  Design: [docs/user-clashes.md](docs/user-clashes.md).
- **KAH constraints are notify-only.** After every successful create/update (never delete),
  `dispatchKahBreachCheck()` (`src/lib/kah/notify.ts`) runs inside `after()` — best-effort,
  it can never fail or delay the mutation. The KAH Status nav entry carries an amber
  **breach count** badge (`checkKahBreaches`, `src/lib/kah/statusActions.ts`) — groups
  breaching on any day from today through the next 30 days, counted once each; and the
  `/kah-status` page renders each breach as a collapsible `ClashCard` (group roster with
  away/in-country state + the overseas events behind it, opening the shared read-only
  `EventDetail` in place).
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
  control's accessible name (visual badge `aria-hidden`). Design: [docs/accessibility.md](docs/accessibility.md).

## Conventions

- **After every codebase change (not docs-only), explain the dev→prod git workflow for
  the user to run themselves** — all work lands on `dev`; `main` only advances by merging
  `dev` (never commit straight to `main`). Reference
  [docs/developer-guide.md](docs/developer-guide.md) §1.8: commit → `git push origin dev`
  (fires CI + Vercel preview, isolated dev Neon/Google) → verify on the preview →
  `git checkout main && git merge dev && git push origin main` (Vercel prod deploy +
  Cloud Run shadow deploy + auto-migrate) → switch back to `dev`. Briefly mention what
  the push triggers per environment (§1.7/§1.9), plus the `pnpm db:migrate` shell-env
  step if the schema changed (§1.11). **Suggest a commit message** summarizing the change,
  matching the repo's concise style — then stop. **You never run these git commands
  yourself** (see Hard rules): hand the user the exact commands and let them push.
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
  go under `@media (min-width: 40em)` in `globals.css`. **Very small phones (≤ 360px)** get
  a compact tier via `NARROW_MEDIA_QUERY` (`src/lib/theme.ts`) + `useMediaQuery` `isNarrow`.
  Design: [docs/desktop-responsive.md](docs/desktop-responsive.md).
- **No mobile keyboard pop-up from dropdown taps:** never render a `searchable`
  `Select`/`MultiSelect` directly — use `NoKeyboardSelect`/`NoKeyboardMultiSelect`. Picking
  users (or any large option list) is a badge dialog (`UserSelectModal`), not a searchable
  dropdown. Its trigger + summary markup is shared: every consumer renders through
  `PickerField` / `PickerBadges` (`src/components/PickerField.tsx`) — never hand-roll it.
  Design: [docs/user-picker.md](docs/user-picker.md).
- **Floating action buttons** use shared `FloatingActionButton` + `FloatingToolbar`
  (`src/components/FloatingToolbar.tsx`) anchored bottom-right — never a raw `Button`.
  Mobile-only toolbars hide via `hiddenFrom="lg"` **on `FloatingToolbar` itself** (its Affix
  portals to `<body>`, so a wrapper's `display:none` can't reach it).
- **Actionable toasts** use the shared **action pill** (`ActionPillProvider` +
  `useActionPill()`, `src/components/ActionPill.tsx`) — a bottom-floating two-tone pill
  with a light progress fill — never `notifications.show({ message: <Button/> })`.
  Design: [docs/action-pill.md](docs/action-pill.md).
- **Global bottom nav** (`AppShell.Footer`): Calendar `/dashboard`, Parade State
  `/parade-state`, Contacts `/contacts`, Double Booking `/double-booking` (every role);
  admins/KAH members additionally get KAH Status `/kah-status`; Settings `/settings` is
  admin-only. `SettingsTabs` stacks directly above it.
- **Admin settings live under `/settings`** (admin-only): Users, Departments, Event Types,
  Templates, Webhooks, Quick Links, KAH Groups, Banner, General, Security, Audit Log,
  Feature Flags tabs.
  Event-type policy (shortname, display groups, allowed-locations matrix, `show_remarks`/
  `show_invitees`, per-type `show_location`): [docs/event-lifecycle.md](docs/event-lifecycle.md).
  Colors (event types + department fallback, applied at read time in `mapCalendarItem`,
  never cached): [docs/roster-sharing.md](docs/roster-sharing.md).
- **Feature Flags (Settings → Feature Flags, org-wide):** when a new feature has multiple
  presentational/behavioral variants an admin may want to compare live or toggle for the whole
  org (A/B-style experiments, alternate heads), **don't hand-roll a toggle** — extend the
  feature-flag framework: add the typed `settings` column + one `FeatureFlagDef` entry in
  `src/lib/settings/featureFlags.ts` (the last Settings tab auto-renders its control), resolve
  the value server-side and pass it down as a prop. Flags are **global** (no per-user override),
  default to today's behavior, and every flip is audited. Flags: `pinnedTickerIndicator`
  ([`pinned-events.md`](docs/pinned-events.md) §1.4); `savedEventToastVariant` — the four
  post-save event-confirmation presentations (classic pill / restyled pill / toast + action /
  plain toast), resolved into `DashboardSharedConfig` → `EventForm`
  ([`action-pill.md`](docs/action-pill.md)); and `translucencyLevel` — the app-wide frosted-glass
  opacity (subtle / medium / strong) for the page's overlapping surfaces (sticky
  calendar chrome, bottom nav, sidebar, floating controls; the header and overlays stay opaque), published on `<html>`
  as `data-c2-glass` by the shell (plus a `c2-glass--<level>` class on the mobile FAB cluster via
  `DashboardSharedConfig` → `DashboardView`)
  ([`dashboard-views.md`](docs/dashboard-views.md) §1.1). Design:
  [docs/feature-flags.md](docs/feature-flags.md).
- **Templates:** display-name template + **structured recipes** (`src/lib/settings/titleRecipe.ts`,
  no free text beyond an optional per-segment Text field) with per-target assignments
  (incl. `pinned`/`pinnedHeader` and the push bodies `notifyCreated`/`notifyAdded`).
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
- **Standard loading appearance: skeleton only + fade-in on reveal.** The skeleton is the
  ONLY loading indicator — never dim/darken content (`opacity: isPending ? …` is banned).
  Every data-awaiting route segment gets a `loading.tsx`; every skeleton block includes a
  `LoadingStatus` (sr-only `role="status"`). Complemented by the shared **global activity
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
  (fresh solid / loading spinner top-right / not-loaded faded) via `tabStatus`. Design:
  [docs/loading-transitions.md](docs/loading-transitions.md) §1.13/§1.13.1/§1.13.2.
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

## Vercel / Cloud Run / env gotchas

- Leave `NEXTAUTH_URL` **unset on Vercel** (empty value breaks `/login` prerender; NextAuth
  falls back to `VERCEL_URL`); on the Cloud Run shadow it **must be set** to the `*.run.app`
  URL (no `VERCEL_URL` fallback there).
- Set `ENABLE_EXPERIMENTAL_COREPACK = 1` so Vercel honors pnpm `11.18.0`; otherwise it
  detects pnpm 10 and ignores the pnpm-11 `allowBuilds` (`@swc/core`/esbuild/sharp/unrs-resolver).
- **Web Push** needs `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`
  together on **every** deploy surface (Vercel prod + preview, Cloud Run shadow, `.env.local`).
  Generate once with `npx web-push generate-vapid-keys`; the same pair is shared across
  environments. `NEXT_PUBLIC_*` is build-time — the Cloud Run image gets it as a Docker
  build arg. Skipped gracefully until all three are set. Details:
  [docs/developer-guide.md](docs/developer-guide.md) §1.9.1, [docs/event-notifications.md](docs/event-notifications.md).
- `main` → production, `dev` → preview. **Environments are fully isolated** (separate Neon
  projects + service accounts per env); CI runs `pnpm db:migrate` per branch. **Never point
  a data-copied DB at a different service account** (the `calendars` table stores Google
  calendar IDs). Copy `.env.example` → `.env.local`; required: `DATABASE_URL`,
  `NEXTAUTH_SECRET`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_PIN`, + Google service-account vars.
- **Dual-hosting:** Vercel (prod + preview) and, from the same commit, a Cloud Run **shadow**
  (`deploy-cloudrun`, `main`-only) sharing prod Neon + the prod service account. Platform
  differences live in env/deploy files, never `next.config`/`src/`. Details + cutover/abort:
  [docs/developer-guide.md](docs/developer-guide.md) §1.9.1.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical strings, recorded as `Status:` lines. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
