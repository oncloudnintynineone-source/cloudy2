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
  directly.
- **Calendar month reads are cached server-side.** The dashboard/overview data flow is
  `fetchMonthEvents()` (`src/lib/events/queries.ts`) → `getCachedMonthEvents()` in
  `src/lib/google/eventsCache.ts`, which serves one row of the `google_event_cache` table
  (composite PK `calendar_google_id` + `month`) per department calendar per month. One entry
  serves every user/filter on both `/dashboard` and `/overview`. Fresh for 30s
  (`GCAL_CACHE_FRESH_MS`), then stale-while-revalidate for up to 30min (`GCAL_CACHE_EXPIRE_MS`):
  stale rows are served while `after()` refreshes them in the background from Google; absent
  or expired rows block on a fresh `events.list` + upsert. Never call `integration.listEvents`
  directly for the month view. In-app mutations delete the touched rows via
  `invalidateGcalCache()` in `src/lib/events/actions.ts` (using the same calendar-id + month
  sets derived from targets and date ranges) so the mutating user sees their change on
  `router.refresh()`; `findCopies` inside mutations intentionally bypasses the cache. The
  pure, tested helpers live in `src/lib/google/eventsCacheCodec.ts` (`cacheEntryState`,
  `encodeCachedEvents`, `decodeCachedEvents`) plus `monthsInRange`/`shiftMonth` and
  `mapWithConcurrency`. The cache is deliberately a DB table, not Next's `use cache`/`cacheTag`
  data cache — those require `cacheComponents: true`, which crashed Turbopack `next dev` on
  Node 26 (unfixed vercel/next.js#96165) and added PPR/`instant` complexity.
- The **Overview** page (`/overview`, reachable from the bottom nav) shows per-month,
  per-user counts by event type. Counting is a pure helper in `src/lib/overview/counts.ts`
  (`involvedUserIds` + `buildOverviewCounts`) — unit-tested without a DB. Scope mirrors
  the dashboard: admins see all users/departments, regular users only their own department.
  The matrix mirrors the dashboard's `ResourcesDayView` layout: a sticky department column
  with the name written vertically (`writingMode: "vertical-rl"`), a sticky short-name
  column (`user.shortname || user.name`), then one column per event type, inside a bounded
  `ScrollArea` (`height: min(60vh, 520px)`) so the header stays visible. Users with no
  department are grouped under an `Unassigned` pseudo-department. Each department's rows
  carry a distinct hue-derived tint (`hsl`, `hue = index * 360 / deptCount`) that is
  theme-aware (`useComputedColorScheme` picks softer pastels in light mode, muted darks in
  dark mode); the merged department column uses a slightly stronger shade for contrast.
  The page shares the dashboard's filter (`FilterButton` + `FilterModal`, URL params
  `cal`/`users`/`types`): Calendars (grid chips), a searchable Users group with an
  "Only me" quick action, and Event Types (which also narrows the shown columns).
  Non-admins default to their own department but may filter to any department, matching
  the calendar page.

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
- **The app is strictly mobile-only.** There is no sidebar or hamburger menu. Lists render
  as stacked **card lists** (`Paper` per row), never `<Table>`. Modals are **floating**
  dialogs: `centered` with a fixed `size` (never `fullScreen` — they must not fill the full
  screen width). Keep this pattern for all new UI.
- **Floating action buttons** use the shared `FloatingActionButton` + `FloatingToolbar`
  (`src/components/FloatingToolbar.tsx`) anchored bottom-right — never a raw `Button`.
  `FloatingActionButton` sets `radius="xl"`, the pill shadow, and a 43px height (1.2× the
  Mantine `sm` default) for consistent touch targets; don't override height inline. The
  default `bottomOffset` clears the **global bottom nav** (`src/lib/bottomNav.ts`); under
  the settings tab bar pass `bottomOffset={SETTINGS_TAB_BAR_OFFSET}` (exported from
  `src/app/(protected)/settings/settingsTabBar.ts`) to `FloatingToolbar`.
- **Global bottom nav** lives in `AppShellShell`'s `AppShell.Footer` (height from
  `BOTTOM_NAV_HEIGHT_CSS` in `src/lib/bottomNav.ts`) with three tabs: **Calendar**
  (`/dashboard`), **Overview** (`/overview`), and **Settings** (`/settings`, admin-only).
  The Settings sub-tab bar `SettingsTabs` stacks directly above it
  (`bottom: BOTTOM_NAV_HEIGHT_CSS`).
- **Admin settings live under `/settings`** (admin-only), reached via the bottom-nav
  Settings tab. A horizontal scrollable `SettingsTabs` bar (`src/app/(protected)/settings/`)
  switches between the Users (`/settings/users`), Departments (`/settings/departments`),
  Event Types (`/settings/event-types`), Templates (`/settings/templates`), and General
  (`/settings/general`) tabs. **Event types carry a `shortname`** (their acronym, app-required
  and unique) shown on the type cards and rendered by the `{type:acronym}` title token.
  The **Templates tab** holds the two template cards: the **display name template**
  (`settings.name_template`, with `{name}`/`{department}` placeholders, expanded by the pure
  `formatFullName()` helper in `src/lib/settings/formatName.ts`) and the **event title
  template** (`settings.event_title_template`, with `{description}`/`{type}`/`{type:acronym}`/
  `{departments}`/`{people}`/`{people:full}`/`{people:acronym}`/`{people:fqn}` tokens — bare
  `{people}` and `{type}` are the fully qualified/plain names — expanded by the pure
  `formatEventTitle()` helper in `src/lib/settings/formatEventTitle.ts`). Event titles are
  rendered into the Google event summary on create/edit; the raw description round-trips via
  the `title` field of the event notes JSON so the edit form always prefills the original text.
  The notes carry the link written on every create/edit as a human-readable
  `Edit: <url>` line above the notes block (deep link to `/dashboard?date=…&edit=<eventId>`,
  which opens the event's edit form); the app origin is derived from the request headers in
  `src/lib/appUrl.ts`. The block itself is stored opaque — a JSON object brotli-compressed
  and base64url-encoded on one line (`encodeNotesBlock`), with `parseEventNotes` as the
  single reader (it also decodes older raw-JSON events, v1/v2). A final human-readable
  line `Created in cloudy2` (`INTERNAL_EVENT_MARKER`, appended via `withInternalMarker`)
  marks the event as created in the app; events without the marker **and** without a notes
  block are treated as **external** (`isExternalEvent`) — flagged with an "External" badge
  in the event detail and pinned to their calendar's department row in the Day view.
  The **General tab** holds only the login keyword setting.
- **Always show a loading skeleton for async loads.** Any route or view that awaits data
  before rendering (DB queries, fetches) must show a Mantine `Skeleton` fallback instead of
  a blank screen. In the App Router add a `loading.tsx` to the route segment (auto Suspense
   fallback, e.g. `src/app/(protected)/settings/users/loading.tsx`); for client-side async use
   a `Skeleton` state. Shape the skeleton to match the real card list.
 - **Buttons that trigger async work must show a loading indicator in the button itself.**
   Use Mantine's `loading` prop on `Button` together with the shared
   `loaderProps={BUTTON_LOADER_PROPS}` from `src/lib/theme.ts`. For `useForm`-backed submit
   buttons use `loading={form.submitting}` (auto-managed by `form.onSubmit`, also prevents
   double-submits); for manual handlers (deletes, status toggles, add/remove rows, etc.)
   hold a local `loading` state around the `await` — set it before the call, clear it in a
   `finally` block — and guard against re-entry (see `src/components/LoginForm.tsx`).
- The **Users** section is the route `/settings/users` (admin-only), but its internal domain
  code (types/actions/queries) lives under `src/lib/roster/*`. The "roster" module name is
  internal and should not be renamed to match the UI label.
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
