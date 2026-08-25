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

Design deep-dives live in [docs/](docs/) — each bullet below links its doc; read it
before changing the subsystem.

- Path alias `@/*` → `./src/*` (tsconfig + vitest both).
- `src/db/index.ts` exports `db` as a **lazy Proxy** over postgres-js — the connection
  is only opened on first use, so build/CI work without a live DB. Never import/require
  `DATABASE_URL` at module load time or build breaks.
- `src/db/schema.ts` is the Drizzle schema. `drizzle.config.ts` generates into
  `./drizzle`. **`drizzle/meta/` is committed** — commit it and the generated `*.sql`
  migration together whenever you change the schema; CI's drift check runs
  `pnpm db:generate` then fails on any diff to `drizzle/`.
- The single `settings` row is enforced by a `settings_singleton` check constraint.
  `ensureSettingsRow()` in `src/lib/bootstrap.ts` lazily seeds it on first auth, hashing
  `ADMIN_INITIAL_PASSWORD` (env) when no admin password exists yet.
- Auth is **NextAuth v4** (Credentials provider, JWT sessions), not v5. Config in
  `src/lib/auth.ts`; `id`/`role`/`phone` carried via session callbacks, declared in
  `src/types/next-auth.d.ts`.
- Role/session guards in `src/lib/session.ts`: `requireSession()`, `requireAdmin()`,
  `getSession()`. Use them in Server Components/route handlers.
- Login is a **single input** auto-detected as admin password or `[phone][keyword]`.
  Parsing lives in `src/lib/login.ts` as pure, I/O-free functions. Keep it pure — it's
  unit-tested without a DB.
- Google access goes through `getGoogleIntegration()` (`src/lib/google/index.ts`) —
  real service-account impl when configured, no-op stub otherwise; Gmail methods still
  throw. Don't call Google APIs directly.
  Design: [docs/google-integration.md](docs/google-integration.md).
- **Calendar reads are cached server-side.** Flow: `fetchMonthEvents()` /
  `fetchRangeEvents()` (`src/lib/events/queries.ts`) →
  `getCachedMonthEventsForCalendars()` (`src/lib/google/eventsCache.ts`) — layered per
  calendar × month: L1 in-process map → one batched `SELECT` on `google_event_cache` →
  blocking fresh `events.list` + upsert. Fresh 60s (`GCAL_CACHE_FRESH_MS`), then
  stale-while-revalidate to 30min (`GCAL_CACHE_EXPIRE_MS`) via background `after()`
  refreshes with coalescing; misses prefetch adjacent months. **Never call
  `integration.listEvents` directly for month/range views** (a Monday-first week can
  span two months — use `fetchRangeEvents`). In-app mutations must call
  `invalidateGcalCache()`; other warm instances can serve pre-change L1 copies for up to
  60s, and `findCopies` inside mutations deliberately bypasses the cache. The
  force-refresh button's one-shot `?refresh=` nonce calls with `{ force: true }`,
  bypassing L1+L2 inside the same RSC request. Pure helpers in
  `eventsCacheCodec.ts`. Deliberately a DB table, not Next's `use cache`/
  `cacheComponents` (crashed Turbopack dev, vercel/next.js#96165).
  Design: [docs/events-cache.md](docs/events-cache.md).
- Dashboard + parade-state ⋮ menus hold quick filter actions: **My Events**
  (Users filter = current user), **Clear**, **More Filters** (opens `FilterModal`; the
  dialog also has a draft-scoped My Events action). On the dashboard an active **Users**
  filter also narrows the rows of Day/Week/Week v2 (`buildScheduleResources`
  `userFilter`, `src/lib/events/schedule.ts`). Non-admins default to their own
  department but may filter to any department.
- **Week v2** (`?view=weekv2`) is a custom week matrix (7 day-columns × the same
  resource rows as Day/Week) in `WeekMatrixView.tsx` — no Mantine Schedule component
  fits this shape. Cell binning is pure `buildWeekLanes`/`coveredDays`
  (`src/lib/events/weekMatrix.ts`); data comes from the same `fetchRangeEvents`
     2-month read as Week, so cache/filters/force-refresh are inherited unchanged.
- **Dashboard cold start: streamed events + lazy modules.** `page.tsx` resolves
   filters + department in one `Promise.all` and passes the events fetch to
   `DashboardView` **un-awaited**; the shell chrome (tabs, date-nav, FABs) paints
   first, and `EventsArea.tsx` — the view grid, week/day strips, agenda tab + day
   modal, and `?edit=` resolution (the only code that reads `events`) — sits in a
   `Suspense` boundary and unwraps the promise with React `use()`. Cold start:
   `loading.tsx` covers the (now metadata-only) page-suspension window, then the
   chrome paints before the (possibly Google-bound) read completes. Navigation
   transitions hold the committed grid (showPrevious) until the new promise
   resolves; **force refresh is a plain push (no transition) + `forcePending`
   state** in `DashboardView`, so the Suspense fallback (a `ViewLoadingSkeleton`
   matching the old `gridLoading` branch) covers the whole fetch; `forcePending`
   clears via `onEventsResolved` when the events promise settles. All five views
   (the four `@mantine/schedule` + `WeekMatrixView`) and the modals (`EventForm`,
   `EventDetail`, `FilterModal`, `DateSelectorModal`) are `next/dynamic` modules
   in `lazy.tsx`: the active view's chunk is primed at render time
   (`ensureActiveView(view)`), the rest warm in `requestIdleCallback`
   (`preloadDashboardModules`). Modals mount from their first open onward
   (`*EverOpened` flags in `DashboardView`) so close animations still play;
   `EventDetail` keeps its `keepMounted` post-open (its `displayEvent` shrink-out
   depends on it). `@mantine/schedule` + `@mantine/dates` CSS is imported at the
   usage sites (`EventsArea`, `DateSelectorModal`, `EventForm`, `AuditLogView`),
   not the root layout. `WeekDayLabelStrip`/`TimeRulerStrip` live in `strips.tsx`.
   Measured dashboard first load: 1339 → 1027 KiB JS, 330 → 305 KiB CSS.
- **Fullscreen calendar (immersive mode):** a 36px toggle in the dashboard
  date-nav row (`IconArrowsMaximize`/`IconArrowsMinimize`, `aria-pressed`,
  tooltip "Fullscreen"/"Exit fullscreen") hides the shell header, bottom nav
  and desktop sidebar, and requests the page-level Fullscreen API
  (`requestFullscreen({ navigationUI: "hide" })`) so the OS status bar /
  browser UI go too. State is owned by `AppShellShell` (it renders the chrome
  being hidden) and exposed via `useImmersiveMode()` (`src/lib/ui/immersiveMode.ts`);
  only `DashboardView` controls it and always exits on unmount, and the shell's
  `fullscreenchange` listener follows `Esc` / the Android status-bar edge
  gesture. The CSS half is the `app-shell-immersive` class on the AppShell root
  (globals.css): it hides the direct `<header>/<nav>/<footer>` children and
  zeroes `--app-shell-header/navbar/footer-offset` — declarations on the root
  div beat Mantine's `:root`-injected vars (same mechanism as the 56px header
  offset), so the AppShell main padding and the sticky chrome / Week strips
  re-pin to the viewport edge with no per-view changes. The dashboard's
  floating toolbars take the freed bottom-nav space: `FloatingToolbar` gets
  `bottomOffset="var(--app-floating-bottom-offset-immersive)"` while active
  (a `:root` var, because the Affix portals to `<body>`). Browsers that reject
  page fullscreen (iOS) keep the CSS-only mode — the sticky chrome then takes
  `env(safe-area-inset-top)` padding. Deliberately NOT persisted in `cloudy2.ui`
  (transient focus mode; refresh/navigation starts with the chrome up).
- **Quick Links** are admin-managed shortcut links shown on the Calendar page
  (Settings → Quick Links tab). `quick_links` table (`src/db/schema.ts`:
  label, url, icon key, Mantine-palette color, enabled, sortOrder); CRUD +
  reorder in `src/lib/quickLinks/actions.ts` (audited `quickLink.*`,
  revalidates `/settings/quick-links` + `/dashboard`; `moveQuickLink`
  renumbers to unique ascending `sortOrder` inside its transaction). The
  curated icon registry is pure in `src/lib/quickLinks/icons.ts` (keys +
  labels); icon components and the `QuickLinkIcon` / `QuickLinkIconPicker` /
  `QuickLinksMenu` components are client-only (the picker is a tappable icon
  button grid, never a Select). Validation in `src/lib/quickLinks/validate.ts`
  (http/https URLs only). `page.tsx` (dashboard) passes only **enabled**
  links to `DashboardView` (the `quickLinks` prop); a deliberately
  non-customizable **amber `IconLink` launcher** (never grey dots — it must
  not blend with the "More options" kebab) — light-`accent` FAB beside the
  "New event" FAB on mobile, labelled "Quick links" light-`accent` 36px nav-row
  chip at lg — renders only when the list is non-empty and always opens the
  menu (never a direct link); items are page-scale (16px text, ~44px rows)
  and open their URL in a new tab; the dropdown pops from the anchored
  corner like the kebab menu.
- **Announcement banner:** an admin-managed persistent banner above the navy
  header bar, visible to all signed-in users (Settings → Banner tab). Config
  lives on the singleton `settings` row (`banner_enabled`/`banner_text`/
  `banner_color`/`banner_height`); curated background palette, height presets
  (`BANNER_HEIGHT_PRESETS`: Short 28 / Medium 36 / Tall 48 / XL 64) and
  validation are pure in `src/lib/banner/banner.ts` (admins pick swatches + a
  preset, never color codes or raw px; each color entry pins its readable text
  color; `normalizeBannerHeight` snaps any stored value to the nearest preset);
  audited `updateBanner` action revalidates `/settings/banner`. The protected
  layout reads `getBanner()` (per-request deduped via React `cache`) and passes
  it to `AppShellShell`, which renders `AnnouncementBanner` inside
  `AppShell.Header` above the brand bar and grows `--app-shell-header-offset`
  by setting `--app-banner-height` **inline** on the AppShell root (the
  `calc(56px + var(--app-banner-height))` chain lives on `.app-shell-root` in
  globals.css — no class toggling), so main padding, navbar and all sticky
  chrome follow automatically. Do NOT pass it via Mantine's `vars` prop — in
  v9 that is a resolver *function*, not an object. Disabled = null = today's
  layout exactly (no reserved space); immersive mode hides it with the rest of
  the chrome; text wraps and clips at the chosen preset height (full text on
  hover via `title`).
- **Remembered UI state survives relaunch** in one cookie, `cloudy2.ui` (base64url
  JSON, max-age 1y): lastPage, sidebarCollapsed, dashboard `{view,date,month,cal,users,
  types,pinnedViews}`, parade `{date,month,cal,users}`. The server applies it per-key as
  fallback only where the URL param is absent (URL always wins; `?edit=` deep links skip
  it entirely), so cold starts render the remembered view before first paint. The client
  owns writes: `writeUiState()` (`uiStateClient.ts`), `useRememberedPage()`
  (AppShellShell), and `usePersistUiState()` in both views re-persists server-resolved
  props after each render. Navigations that *remove* remembered keys auto-inject the
  one-shot `?_fresh=1` marker (`freshMarkerNeeded()`) so that render uses pure defaults.
  Pinned tabs are cookie-only — read even on `_fresh`/`edit` renders — shaped by
  `normalizePinnedViews()`/`orderDashboardViews()`. `clearUiState()` runs on sign-out.
  Helpers are pure + unit-tested in `uiState.test.ts`; oversized cookies degrade by
  dropping id lists. Design: [docs/ui-state.md](docs/ui-state.md).

## Conventions

- UI is **Mantine v9**; theme in `src/lib/theme.ts`, mounted by the client component
  `AppProviders` (`src/components/AppProviders.tsx`). The theme carries a function value
  (`components.Input.vars`), so `MantineProvider` (and `Notifications`) must stay in that
  client wrapper — don't move them into the server `layout.tsx`.
- **Brand colors:** primary `#0D47A1` (deep blue), secondary `#FBC02D` (amber) — use for
  badges, chips, highlights, event-type colors, etc. Authenticated routes live under
  `src/app/(protected)/`.
- **Mobile-first; desktop layout at `lg` (pinned to 992px** via `breakpoints.lg = "62em"`
  in theme.ts). Below lg: touch layout — bottom nav, stacked card lists (`Paper` per row,
  no `<Table>`), floating centered modals with fixed `size` (never `fullScreen`). At/above
  lg: left sidebar (240px AppShell navbar, minimizing to a 64px icon rail whose collapsed
  state comes from the cookie pre-paint), 1200px `PageContainer`, data-dense settings
  lists become Mantine Tables, `.card-grid` reflow for card lists, modals widen one step,
  2-column form Grids. Detect the breakpoint in client components with
  `useMediaQuery(\`(min-width: ${theme.breakpoints.lg})\`)` — do **not** append px (it's
  an em string; appending makes an invalid query that always returns false). Pure-CSS
  switches go under `@media (min-width: 62em)` in `globals.css`.
  Design: [docs/desktop-responsive.md](docs/desktop-responsive.md).
- **No mobile keyboard pop-up from dropdown taps.** Never render a `searchable`
  `Select`/`MultiSelect` directly — use shared `NoKeyboardSelect`/`NoKeyboardMultiSelect`
  (`src/components/NoKeyboardSelect.tsx`); keep native `readOnly` until the dropdown
  opens. Don't use Mantine's `readOnly` prop — it disables the whole dropdown.
   **Department selects are never searchable** (short list; plain Select/MultiSelect
   targets are buttons). Exception: the User-form Department field is a row of toggleable
   `Badge`s (a Select's focused input focus-scrolls the modal spasmodically on mobile).
- **Picking users (or any large option list) is a badge dialog, not a
  searchable dropdown.** `UserSelectModal` (`src/components/UserSelectModal.tsx`):
  a `Modal` listing its sections of toggleable badges with a search box on top —
  typing removes non-matching options immediately (an option survives when its
  label, its extra `search` terms, **or its section label** match; emptied
  sections disappear). Callers pass `groups: PickerGroup[]` (render order) and
  `values: Record<sectionLabel, string[]>` and get `onConfirm(values)` back —
  ids in, ids out, so each caller keeps its own id domain. The draft lives in a
  child that mounts with the modal, so it re-seeds from `values` on every open
  (the FilterModalBody pattern); pass `zIndex` when nested (event wizard uses
  300 over its z-250 dialog, FilterModal 200). Users render grouped by
  department ("No department" last) via `buildUserGroups`; pure helpers
  (`optionMatchesQuery`, `sortOptionsInGroups`, `buildUserGroups`,
  `filterPickerGroups`, `selectionByGroup`) are in `src/lib/users/userSelect.ts`,
  unit-tested. Used by the event wizard's Invited Attendees step (a flat
  `Departments` section + user sections; the form's `invitees` field keeps its
  `user:`/`dept:` prefixed shape) and by FilterModal's `variant: "search"`
  groups (Users on dashboard + parade state; options may carry `department` to
  get per-department sections, `search` for extra matching). The admin
  "On behalf of" single-select stays a `NoKeyboardSelect`.
- **Floating action buttons** use shared `FloatingActionButton` + `FloatingToolbar`
  (`src/components/FloatingToolbar.tsx`) anchored bottom-right — never a raw `Button`.
  65×65 circle (`radius="50%"`), icon-only: children = tabler icon at `FAB_ICON_SIZE`
  (30px) + `aria-label`; don't override width/height inline. Default `bottomOffset`
  clears the global bottom nav; settings pages pass `var(--settings-fab-bottom)`.
  Mobile-only toolbars hide via `hiddenFrom="lg"` **on `FloatingToolbar` itself** —
  never a wrapper element: its Affix portals to `<body>`, so a wrapper's
  `display:none` can't reach it.
- **Global bottom nav** (`AppShell.Footer`, height `BOTTOM_NAV_HEIGHT_CSS` from
  `src/lib/bottomNav.ts`): Calendar `/dashboard`, Parade State `/parade-state`, Contacts
  `/contacts`, Settings `/settings` (regular users get the first three). `SettingsTabs`
  stacks directly above it.
- **Admin settings live under `/settings`** (admin-only): Users, Departments, Event
   Types, Templates, Webhooks, Quick Links, General, Audit Log tabs. Event types carry an
   app-required unique `shortname` (the `{type:acronym}` title token), a
   `location_policy` (`in`/`out`/`both`) enforced client- and server-side by pure
   `clampOutOfCamp()` (`src/lib/events/locationPolicy.ts`) — the location field IS
   the out-of-camp destination; `resolveEventLocation()` silently re-clamps on
   create/update — and an optional event `color` (Mantine palette name; null =
   deterministic default derived from the type name), edited in the event type
   form modal. Departments keep an optional fallback `color` used ONLY for
   untyped/external events (null = deterministic per-calendar default). Both
   colors are applied at read time in `mapCalendarItem` (pure helpers in
   `src/lib/events/eventColors.ts`), never stored in the events cache, so no
   invalidation on change.
- **Templates tab:** display-name template (`formatFullName()`) + event-title template
  (`formatEventTitle()`, tokens `{description} {type} {type:acronym} {departments}
  {location} {people}` plus `{people:full|acronym|fqn}`). Rendered titles go to the
  Google summary; the raw description round-trips via the notes' `title` field so edits
  prefill original text.
- **Event notes:** an `Edit: <url>` deep-link line (origin from request headers,
  `src/lib/appUrl.ts`) above an opaque brotli+base64url JSON block (`encodeNotesBlock`;
  `parseEventNotes` is the single reader and decodes legacy v1/v2), ending with the
  `Created in cloudy2` marker (`withInternalMarker`). Events lacking the marker **and**
  the block are **external** (`isExternalEvent`: "External" badge + pinned to their
  department row in Day view). Location lives in Google's first-class `location` field;
  the `outOfCamp` flag rides in notes (`parseEventOutOfCamp`). Flows:
  [docs/event-lifecycle.md](docs/event-lifecycle.md),
  [docs/event-mutations.md](docs/event-mutations.md).
- **General tab:** login keyword, `audit_log_retention_days` (default 90, clamp 7–365).
  **Audit Log tab:** URL-param filters, keyset pagination (`listAuditLogs`), CSV export
  at `/api/audit/export`. **Rotation is on-read** (every render purges past retention) +
  a manual delete button; no cron. Never call `listAuditLogs`-adjacent helpers with a
  live DB in tests — the pure parts are unit-tested.
- **Audit `details` payloads are human-readable by design** — flat, display names not
  ids, times pre-formatted in UTC+8 wall clock, `title` = the rendered Google title
  (pure `renderEventTitle`, shared with the write path so they can't diverge). Updates
  store `diffFields(before, after)`; unsupplyable fields show `—` (`EMPTY_VALUE`).
  `formatAuditDetails` renders changes / fields / pretty-JSON fallback. Keep new
  payloads flat and human-readable. Design: [docs/audit-log.md](docs/audit-log.md).
- **Event webhooks notify external systems** of successful create/update/delete:
  admin-registered endpoints (`webhooks` table; Settings → Webhooks tab) each get a
  fire-and-forget POST via `after()` — never delays/fails the mutation, no retry
  queue, one endpoint's failure never affects the others. Every enabled endpoint
  receives every action. Payloads are built by pure `buildEventWebhookPayload`
  (`src/lib/webhooks/payload.ts`) from the **same audit snapshots** (all form fields,
  names resolved); updates carry `changes` `[before, after]` pairs. Each delivery
  signs with its endpoint's secret: HMAC-SHA256 over `"timestamp.body"`
  (`X-Cloudy2-Signature`). Dispatch only after each mutation's `logAction`. The tab's
  PayloadReference accordion generates example payloads from the real builder — keep
  it that way (never hand-copy JSON into UI). Design: [docs/webhooks.md](docs/webhooks.md).
- **Standard loading appearance: skeleton only + fade-in on reveal.** (1) The skeleton
  is the ONLY loading indicator — never dim or darken content while loading (the
  `opacity: isPending ? …` pattern is banned); shape it off shared skeleton components
  reused by `loading.tsx`. (2) Every data-awaiting route segment gets a `loading.tsx`;
  put `CONTENT_ENTER_CLASS` (`src/lib/loading/contentEnter.ts`) on committed content
  roots. (3) Gate client-side skeletons on `useMinSkeletonHold(pending)` (~350ms hold);
  reveal fades via `useContentEnter(ref, !loading)` / `.content-enter` (300ms;
  reduced-motion users get a hard swap). (4) Strip one-shot URL params with a plain
  `router.push` outside `startTransition`; `navigate()` early-returns when the href is
  unchanged (no skeleton flash on no-ops). (5) `router.refresh()` after server actions
  isn't wrapped in transitions — the button loader covers it. (6) Controls answer
  instantly on slow networks: nav highlights flip optimistically at tap time
  (`tappedHref` + `useLinkStatus` in `AppShellShell`, reverted on commit or after a 6s
  stall timer) and the dashboard's date-nav chrome (`shown*` state in `DashboardView`)
  leads the server props, snapping back when the transition ends; grids/data keep
  rendering from committed props. `experimental.staleTimes.dynamic = 120`
  (`next.config.ts`) makes warm soft navigations reuse cached payloads. In-page
  exception: in-month/optimistic switches (parade state, Agenda tab) show no skeleton;
  only cross-month data navigations do.
  Design: [docs/loading-transitions.md](docs/loading-transitions.md).
- **Buttons triggering async work show loading in the button itself:** Mantine `loading`
  prop + shared `loaderProps={BUTTON_LOADER_PROPS}` (`src/lib/theme.ts`);
  `loading={form.submitting}` for useForm submits; local `loading` state set before /
  cleared in `finally` around manual awaits, guarding re-entry (see `LoginForm.tsx`).
- **Form validation feedback:** every Mantine form sets `validateInputOnBlur: true`
  and passes the failure handler as the second `form.onSubmit` argument:
  `(errors) => showValidationFailure(errors, (field) => form.getInputNode(field))`
  (`src/lib/ui/validationFeedback.ts`) — a red "Check the highlighted fields" toast
  (same wording as the server path) plus scroll-into-view of the first invalid field.
  Inline field errors alone are easy to miss in a scrollable modal, so new forms must
  include both.
- The Users section is route `/settings/users`, but its domain code stays under
  `src/lib/roster/*` — don't rename the internal module to match the UI label.
  Model + calendar sharing: [docs/roster-sharing.md](docs/roster-sharing.md).
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

## Vercel / env gotchas

- On Vercel, leave `NEXTAUTH_URL` **unset** (empty value breaks `/login` prerender with
  `TypeError: Invalid URL`). NextAuth falls back to `VERCEL_URL`.
- Set `ENABLE_EXPERIMENTAL_COREPACK = 1` so Vercel honors pnpm `11.18.0`; otherwise it
  detects pnpm 10 from the lockfile and ignores the pnpm-11 `allowBuilds` in
  `pnpm-workspace.yaml` (esbuild/sharp/unrs-resolver build scripts).
- `main` → production, `dev` → preview. Copy `.env.example` → `.env.local` for local dev;
  required vars: `DATABASE_URL`, `NEXTAUTH_SECRET`, `ADMIN_INITIAL_PASSWORD` (seeds the
  admin password hash on first run), plus Google service-account vars.
