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
pushes to `main`, a `migrate` job additionally runs `pnpm db:migrate` against Neon using
the `DATABASE_URL` repo secret — so pending migrations auto-apply on deploy — and a
`deploy-cloudrun` job then deploys the Cloud Run shadow (§1.9.1 of
docs/developer-guide.md). PRs only run the quality checks.

## Architecture

Design deep-dives live in [docs/](docs/) — each bullet below links its doc; **read it
before changing the subsystem**. Keep bullets here to rules and entry points; put
mechanics in the doc.

- Path alias `@/*` → `./src/*` (tsconfig + vitest both).
- `src/db/index.ts` exports `db` as a **lazy Proxy** over postgres-js — the connection
  is only opened on first use, so build/CI work without a live DB. Never import/require
  `DATABASE_URL` at module load time or build breaks.
- `src/db/schema.ts` is the Drizzle schema; `drizzle.config.ts` generates into
  `./drizzle`. **`drizzle/meta/` is committed** — commit it and the generated `*.sql`
  migration together whenever you change the schema; CI's drift check runs
  `pnpm db:generate` then fails on any diff to `drizzle/`.
- The single `settings` row is enforced by a `settings_singleton` check constraint;
  `ensureSettingsRow()` (`src/lib/bootstrap.ts`) lazily seeds it on first auth. The two
  admin secrets (`settings.admin_password_hash` ← `ADMIN_INITIAL_PASSWORD`, and
  `settings.admin_pin_hash` ← `ADMIN_PIN`) are seeded on first run and **reconciled from
  their env var on every login** (`syncAdminSecretsFromEnv`) — the env is authoritative,
  there is no in-app path to set or change either secret.
- Auth is **NextAuth v4** (Credentials provider, JWT sessions), not v5. Config in
  `src/lib/auth.ts`; `id`/`role`/`phone` carried via session callbacks, declared in
  `src/types/next-auth.d.ts`.
- Role/session guards in `src/lib/session.ts`: `requireSession()`, `requireAdmin()`,
  `getSession()`. Use them in Server Components/route handlers.
- **Login is a single clean masked input** (no hints, no mode toggle) in
  `src/components/LoginForm.tsx`, submitting to one Credentials provider with a `mode`
  discriminator. On submit a lightweight routing probe `resolveLogin`
  (`src/lib/loginActions.ts`, `"use server"` — hint only, never an authority, no secret
  comparison, no audit) tells the client which flow to run:
  - **Staff** (`role='user'` only): a single `[phone][keyword]` input — parsing lives in
    `src/lib/login.ts` as pure, I/O-free functions. Keep it pure — it's unit-tested
    without a DB. Admin-role users are **rejected** on this path, so the org-wide
    keyword can never yield an admin session.
  - **Admin-role user** (`[phone][keyword]` resolving to an active `role='admin'` user):
    a **modal** prompts for the **shared admin PIN** (`settings.admin_pin_hash`) before
    any session is issued.
  - **Break-glass root**: the input has no keyword and matches
    `ADMIN_INITIAL_PASSWORD` (`settings.admin_password_hash`); signed in phone-less
    with no PIN step.
  `authorize` (`src/lib/auth.ts`) re-checks every credential itself and is the only
  place a session is issued or a failure audited.
- Google access goes through `getGoogleIntegration()` (`src/lib/google/index.ts`) —
  never call Google APIs directly; Gmail methods still throw. It loads `./real`
  via a **dynamic `import()`** — keep it that way: a static import drags the
  ~200 MB `googleapis` package (~1.4s to `require`) into the eager chunk graph of
  every route using the barrel, delaying cold-boot first byte.
  Design: [docs/google-integration.md](docs/google-integration.md).
- **Calendar reads are cached server-side.** Read through `fetchMonthEvents()` /
  `fetchRangeEvents()` (`src/lib/events/queries.ts`) — **never call
  `integration.listEvents` directly for month/range views** (a Monday-first week can
  span two months — use `fetchRangeEvents`). In-app mutations must call
  `invalidateGcalCache()`. Warm L1 hits are verified against L2 with a **metadata-only
  SELECT** (no JSONB), and Google refreshes are coalesced in-process by the `inflight`
  map. The refresh fetch runs **outside any transaction** — the Postgres pool is
  `max: 1`, so holding a transaction across a Google round-trip would serialize every
  other query.
  Design: [docs/events-cache.md](docs/events-cache.md).
- **Event lifecycle & mutations:** staged wizard → Google copies with notes-block
  round-trip; cross-department copies reconciled by `findCopies` (deliberately
  uncached). Design: [docs/event-lifecycle.md](docs/event-lifecycle.md),
  [docs/event-mutations.md](docs/event-mutations.md).
- **Optimistic event mutations:** the dashboard renders a short-lived stand-in chip at
  confirm (not after the Google write + read-your-own-writes refresh) by merging an
  `optimisticOps` overlay into the server `events` prop — the pure engine and the
  stand-in builder live in `src/lib/events/optimistic.ts` (client-safe, unit-tested);
  actions return the ids they already computed (`EventActionResult` success = group
  `eventId` + per-copy `{calendarId, googleEventId}`); the wizard stays open through the
  action (rejections keep the exact field-error UX) and settled ops are dropped by a
  guarded render-phase reconcile on the next props arrival — never an effect. Stand-in
  chips block detail taps until pinned. Design:
  [docs/optimistic-mutations.md](docs/optimistic-mutations.md).
- **Dashboard views & filters:** Month / Week (H) / Week (D) / Day / Agenda over the
  shared cache; one **filter button** (icon + badge) opens the filter modal
  (Calendars + Users prominent, Event Types behind a Show/Hide disclosure); the
  kebab keeps navigation/refresh only. **Filters are scoped per view only** — each
  of Month / Week (H) / Week (D) / Day / Agenda owns its own Cal/Users/Types
  memory (`dashboard.views`, resolved by the pure `resolveDashboardFilters` in
  `ui-state.ts` as URL → view memory → role default; an untouched view never
  inherits another view's filters and `_fresh` clears only the current view).
  The old "same for all views"/shared-set mode is gone. Week (D) is a custom matrix
  (pure `buildWeekLanes`). **Entry highlights are client-side per view:** the
  current user's entries get an amber treatment (row tint + chip/bar ring, mine can
  also claim Month's top rows) and **external** (Google-created) events get the same
  additive treatment in purple — never recolor the event body, keep rings/bars in
  `globals.css` (`c2-my-*` / `c2-ext-*`).
  Design: [docs/dashboard-views.md](docs/dashboard-views.md).
- **Wide grids pan** via `useGridPan` + `GridPanControls` (drag + edge buttons).
  Design: [docs/grid-pan.md](docs/grid-pan.md).
- **Fullscreen calendar (immersive mode):** hides shell chrome + requests page
  fullscreen; owned by `AppShellShell`, only `DashboardView` controls it and always
  exits on unmount. Design: [docs/immersive-mode.md](docs/immersive-mode.md).
- **Quick Links:** admin-managed Calendar-page shortcuts behind the amber `IconLink`
  launcher (never grey dots). Design: [docs/quick-links.md](docs/quick-links.md).
- **Announcement banner** above the header; its measured height feeds
  `--app-banner-height` **inline** on the AppShell root — do NOT use Mantine's `vars`
  prop (a resolver function in v9, not an object).
  Design: [docs/announcement-banner.md](docs/announcement-banner.md).
- **Pinned Events:** the header's left edge is the **pinned-events ticker** — the
  brand pill (pin icon, logo removed) that rotates through the upcoming pinned
  events' titles every 5s behind an inline amber `1/N` count chip (replaced the
  floating `Indicator`); tapping opens the panel of explicitly-pinned upcoming
  events ("Pin this event" switch in the wizard). List refreshes via the
  `cloudy2:pinned-events-changed` window event; ticker titles render through the
  `pinnedHeader` template target (panel list: `pinned`).
  Design: [docs/pinned-events.md](docs/pinned-events.md).
- **Event search:** a header search icon (between the pinned-events ticker and the
  theme toggle) opens a **lazy-loaded** (`dynamic` + `ssr: false`) modal that
  free-text searches every department calendar **directly via Google Calendar**
  (`events.list` with `q` — bypassing the month cache), mapped + deduped by logical
  event and rendered in `@mantine/schedule`'s `AgendaView`; tapping a result shows
  a **spinner on that row** (`useTransition` `isPending`) and deep-links
  `/dashboard?date=…&event=…` (`&_eventCal=<calendar id>` so the dashboard's
  fetch always includes the event's calendar even when the current view's
  filters exclude it — added to the fetch set only, never the filter
  selection), landing on the shared full `EventDetail`
  (Duplicate/Edit/Delete); the modal zooms out of / shrinks into the search button
  (standard `motion/origin`). `q` matches `summary`/`location`/`description`, but
  **not** the compressed notes (type/people), unless the title template renders them.
  Design: [docs/event-search.md](docs/event-search.md).
- **KAH constraints are notify-only.** After every successful create/update (never
  delete), `dispatchKahBreachCheck()` (`src/lib/kah/notify.ts`) runs inside `after()` —
  best-effort, it can never fail or delay the mutation.
  Design: [docs/kah.md](docs/kah.md).
- **Remembered UI state** survives relaunch in one cookie, `cloudy2.ui`: the server
  applies it per-key as fallback only where the URL param is absent (URL always wins);
  the one-shot `_fresh` render is the only whole-cookie skip — `?event=`/`?edit=` deep
  links read the remembered state too, so an event search result or a Google "Edit:"
  note opens on the user's own view + filters (the link's `date` pins the fetched
  period, `_eventCal` adds the event's calendar to the fetch set regardless of the
  filter selection); navigations removing remembered keys inject
  one-shot `?_fresh=1`; `clearUiState()` runs on sign-out.
  Design: [docs/ui-state.md](docs/ui-state.md).
- **PWA offline & instant open** (Serwist, `src/app/sw.ts`): build-versioned SWR
  document + RSC caches; offline is read-only (no local write queue). The launch
  route answers the start URL `/` with the **precached shell, unconditionally** —
  never redirect from it (on a cold launch nothing is painted yet, so a redirect
  that waits on the network just holds the Android splash up; and a SW cannot read
  the `Cookie` request header to resolve the remembered page: it is appended after
  interception). The document route serves a cached copy at **any age**; staleness
  is fixed *after* paint by `useStaleDocumentReconcile`, which is the one
  `router.refresh()` site that must **not** invalidate the document cache (it
  clears RSC only via `invalidateRscPathCaches`) — every other site invalidates
  the current pathname first via `invalidateCurrentPathCaches()`.
  Design: [docs/pwa-offline.md](docs/pwa-offline.md).
- **Unsupported-browser gate:** the app targets the Next 16 / React 19 floor
  (Safari 16.4 / Chrome 111 / Firefox 111 / Edge 111) — deliberately **no
  `.browserslistrc`** and no downleveling; legacy browsers are documented
  unsupported. Below the floor no client JS runs at all, so `/login` is the one
  **dynamic** route: its async server component reads the `User-Agent` header and
  pure fail-open `detectLegacyBrowser` (`src/lib/browserSupport.ts`) swaps the form
  for a server-rendered notice — a client-side banner could never appear on the
  browsers it targets. Never move the gate into a client component or a shared
  layout (`headers()` there would break the precached start-URL shell). Design:
  [docs/browser-support.md](docs/browser-support.md).
- **Accessibility:** skip-to-content link first in the shell; one polite live region
  (`StatusAnnouncer`) announces toast-less state changes (view/period, filter counts,
  zoom); every skeleton block carries a `LoadingStatus` sr-only announcement; count
  badges ride the control's accessible name (visual badge `aria-hidden`).
  Design: [docs/accessibility.md](docs/accessibility.md).

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
- UI is **Mantine v9**; theme in `src/lib/theme.ts`, mounted by the client component
  `AppProviders` (`src/components/AppProviders.tsx`). The theme carries a function value
  (`components.Input.vars`), so `MantineProvider` (and `Notifications`) must stay in that
  client wrapper — don't move them into the server `layout.tsx`.
- **Brand colors:** primary `#0D47A1` (deep blue), secondary `#FBC02D` (amber) — use for
  badges, chips, highlights, event-type colors, etc. Authenticated routes live under
  `src/app/(protected)/`.
- **Mobile-first; desktop layout at `lg` (pinned to 640px — unfolded-foldable
  width; sidebar auto-collapses to the icon rail until 800px).** Detect the
  breakpoint in client components with
  `useMediaQuery(\`(min-width: ${theme.breakpoints.lg})\`)` — do
  **not** append px (it's an em string; appending makes an invalid query that always
  returns false). Pure-CSS switches go under `@media (min-width: 40em)` in
  `globals.css`. **Very small phones (≤ 360px) get a compact tier** via the shared
  `NARROW_MEDIA_QUERY` constant (`src/lib/theme.ts`) + `useMediaQuery` `isNarrow`:
  it's a JS-only query (not a Mantine breakpoint, so it can't collide with `xs:`/`lg:`
  min-width props) used to tighten the header gutters, drop the bottom nav to
  icon-only, and step shared modals down one size (the pinned-events ticker keeps
  rotating — the logo it replaced is gone, so it fits). Design:
  [docs/desktop-responsive.md](docs/desktop-responsive.md).
- **No mobile keyboard pop-up from dropdown taps:** never render a `searchable`
  `Select`/`MultiSelect` directly — use `NoKeyboardSelect`/`NoKeyboardMultiSelect`.
  Picking users (or any large option list) is a badge dialog (`UserSelectModal`), not a
  searchable dropdown. Design: [docs/user-picker.md](docs/user-picker.md).
- **Floating action buttons** use shared `FloatingActionButton` + `FloatingToolbar`
  (`src/components/FloatingToolbar.tsx`) anchored bottom-right — never a raw `Button`.
  Mobile-only toolbars hide via `hiddenFrom="lg"` **on `FloatingToolbar` itself** —
  never a wrapper element: its Affix portals to `<body>`, so a wrapper's `display:none`
  can't reach it.
- **Global bottom nav** (`AppShell.Footer`): Calendar `/dashboard`, Parade State
  `/parade-state`, Contacts `/contacts`, Settings `/settings` (regular users get the
  first three). `SettingsTabs` stacks directly above it.
- **Admin settings live under `/settings`** (admin-only): Users, Departments, Event
  Types, Templates, Webhooks, Quick Links, Banner, KAH Groups, General, Security,
  Audit Log tabs.
  Event-type policy (shortname, display groups — managed in the Event Types tab's
  "Manage groups" dialog and rendered as wizard type-step sections —,
  allowed-locations matrix, `show_remarks`/`show_invitees`):
  [docs/event-lifecycle.md](docs/event-lifecycle.md). Colors (event
  types + department fallback, applied at read time in `mapCalendarItem`, never cached):
  [docs/roster-sharing.md](docs/roster-sharing.md).
- **Templates:** display-name + event-title templates (`formatEventTitle` tokens) with
  per-target View assignments (incl. `pinned` panel + `pinnedHeader` ticker).
  Design: [docs/event-lifecycle.md](docs/event-lifecycle.md) §1.8.
- **Event notes:** `Edit: <url>` line (a `?event=` deep link to the event's details
  modal, carrying the copy's calendar as `_eventCal`; older notes carry the legacy
  `?edit=` link, still honored) + brotli+base64url JSON block + `Created in cloudy2`
  marker; events lacking the marker **and** the block are **external**.
  `parseEventNotes` is the single reader (decodes legacy v1/v2); the `outOfCamp`/
  `overseas` flags ride in notes, location in Google's first-class field.
- **General tab:** `audit_log_retention_days` (default 90, clamp 7–365). **Security tab:**
  the user **login keyword** (staff-only sign-in; admin secrets are env-managed, never
  in-app). **Audit Log:** URL-param filters, keyset pagination, CSV export; **rotation is
  on-read** + a manual delete button, no cron. Never call `listAuditLogs`-adjacent
  helpers with a live DB in tests — the pure parts are unit-tested. Payloads are flat
  + human-readable (display names, UTC+8 wall clock, rendered title) — keep new
  payloads that way. Design: [docs/audit-log.md](docs/audit-log.md).
- **Event webhooks** notify external systems after every successful create/update/
  delete: fire-and-forget POST via `after()` — never delays/fails the mutation, no
  retry queue; dispatch only after the mutation's `logAction`; payloads come from the
  same audit snapshots (never hand-copy JSON into UI).
  Design: [docs/webhooks.md](docs/webhooks.md).
- **Standard loading appearance: skeleton only + fade-in on reveal.** The skeleton is
  the ONLY loading indicator — never dim or darken content (`opacity: isPending ? …`
  is banned). Every data-awaiting route segment gets a `loading.tsx`; committed
  content roots get `CONTENT_ENTER_CLASS`. Every skeleton block includes a
  `LoadingStatus` (sr-only `role="status"`) so screen readers hear the load.
  The one complement to skeletons is the shared **global activity bar** (an
  indeterminate amber strip that pulses while in flight, flush under the
  header) for the busy moments a
  skeleton can't cover — post-mutation `router.refresh()` (use the
  `useActivityRefresh` hook, never a raw `invalidateCurrentPathCaches().then(…
  router.refresh())`), same-shell tab flips, and in-page transitions. Report a
  transition's `isPending` via `useReportActivity`; route `<Link>` nav is wired
  automatically through `PendingDim`. Immediate show + min hold (150ms),
  hidden in immersive mode. Design:
  [docs/loading-transitions.md](docs/loading-transitions.md) §1.13.
- **Buttons triggering async work show loading in the button itself:** Mantine `loading`
  prop + shared `loaderProps={BUTTON_LOADER_PROPS}` (`src/lib/theme.ts`);
  `loading={form.submitting}` for useForm submits; local `loading` state set before /
  cleared in `finally` around manual awaits, guarding re-entry (see `LoginForm.tsx`).
- **Empty states are actionable:** use the shared `EmptyState`
  (`src/components/EmptyState.tsx`; icon + message + one action) wherever a natural next
  step exists (Add/Clear/Manage) instead of a bare dimmed `Text`. Actions are
  role-aware — when the fix lives in admin Settings, non-admins get the plain message
  (see the parade-state/contacts empty states).
- **Form validation feedback:** every Mantine form sets `validateInputOnBlur: true`
  and passes the failure handler as the second `form.onSubmit` argument:
  `(errors) => showValidationFailure(errors, (field) => form.getInputNode(field))`
  (`src/lib/ui/validationFeedback.ts`) — a red toast plus scroll to the first invalid
  field. New forms must include both.
- The Users section is route `/settings/users`, but its domain code stays under
  `src/lib/roster/*` — don't rename the internal module to match the UI label.
  Model + calendar sharing: [docs/roster-sharing.md](docs/roster-sharing.md).
- **Departments form a hierarchy** via `calendars.parent_id` (nullable self FK);
  `sortOrder` is globally unique and encodes preorder tree rank; users belong to
  exactly one (direct) department.
  Design: [docs/roster-sharing.md](docs/roster-sharing.md) §1.7.
- **Cross-department calendar access** lives in `user_calendar_access`
  (user × calendar, role `reader|writer`) and is managed from Users →
  edit-user "Department access" (the user's own department is never a row).
  Google stays the ACL source of truth; the rows record intent so email/department
  changes re-grant/revoke correctly. A roster user's email typed into a
  department's "Additional access" is **blocked** (the message points to user
  settings), and raw rules matching roster users are **adopted** into grant rows
  on user create/email change and on department read. Membership/grants never
  gate the dashboard filters (everyone sees every department).
  Design: [docs/roster-sharing.md](docs/roster-sharing.md) §1.5.
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

- On Vercel, leave `NEXTAUTH_URL` **unset** (empty value breaks `/login` prerender with
  `TypeError: Invalid URL`). NextAuth falls back to `VERCEL_URL`. On the Cloud Run
  shadow it **must be set** to the service's `*.run.app` URL — no `VERCEL_URL`
  fallback exists there (§1.9.1 of docs/developer-guide.md).
- Set `ENABLE_EXPERIMENTAL_COREPACK = 1` so Vercel honors pnpm `11.18.0`; otherwise it
  detects pnpm 10 from the lockfile and ignores the pnpm-11 `allowBuilds` in
  `pnpm-workspace.yaml` (esbuild/sharp/unrs-resolver build scripts).
- `main` → production, `dev` → preview. **Environments are fully isolated**: every
  Vercel env var has separate Production/Preview values — prod Neon project + prod
  service account vs a dedicated dev Neon project + dev service account (separate
  accounts). CI runs `pnpm db:migrate` on `main` pushes (`DATABASE_URL` secret) and on
  `dev` pushes (`DATABASE_URL_PREVIEW` secret), each against its own DB. **Never point
  a data-copied DB at a different service account** — the `calendars` table stores
  Google calendar IDs (dev DB is migrations-only; departments are recreated in-app).
  Copy `.env.example` → `.env.local` for local dev; required vars: `DATABASE_URL`,
  `NEXTAUTH_SECRET`, `ADMIN_INITIAL_PASSWORD` (seeds the admin password hash on first
  run), `ADMIN_PIN` (seeds the shared admin PIN hash), plus Google service-account vars.
- **Dual-hosting (migration):** one codebase runs on Vercel (live prod + preview) and,
  from the same commit, on a Cloud Run **shadow** deployed `main`-only by the
  `deploy-cloudrun` job. Platform differences live in env/deploy files, never
  `next.config`/`src/`: the Docker image runs the regular `next start` over the full
  `.next` build (deliberately not `output: "standalone"` — pnpm's isolated layout
  breaks standalone tracing), so Vercel's build is unchanged. The shadow shares prod
  Neon + the prod service account (read-only validation is safe; mutation testing
  writes prod data twice). GitHub Actions settings for the deploy job: repo
  **variable** `GCP_PROJECT_ID` (not sensitive, so unmasked in logs), **secret**
  `GCP_SA_KEY` (Cloud Run + Artifact Registry service-account key), plus secret
  mirrors of Vercel prod (`DATABASE_URL`, `NEXTAUTH_SECRET`,
  `GOOGLE_SERVICE_ACCOUNT_BASE64`, `GOOGLE_DELEGATE_EMAIL`, `SMTP_URL`,
  `EMAIL_FROM`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_PIN`).
  Details + cutover/abort steps: [docs/developer-guide.md](docs/developer-guide.md) §1.9.1.
