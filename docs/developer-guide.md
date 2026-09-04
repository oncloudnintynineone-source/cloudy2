# 1. Developer guide

Everything needed to develop, test, and deploy Cloudy: setup, scripts, environment,
project layout, testing, CI, git workflow, Vercel deployment, Google configuration,
and the migration workflow. Subsystem design lives in the deep-dive docs indexed in
§1.12; agent-facing rules live in [`AGENTS.md`](../AGENTS.md).

## Table of contents

- [1.1 Tech stack](#11-tech-stack)
- [1.2 Getting started](#12-getting-started)
- [1.3 Scripts](#13-scripts)
- [1.4 Environment variables](#14-environment-variables)
- [1.5 Project structure](#15-project-structure)
- [1.6 Testing](#16-testing)
- [1.7 CI](#17-ci)
- [1.8 Git workflow](#18-git-workflow)
- [1.9 Deployment (Vercel)](#19-deployment-vercel)
- [1.10 Google integration setup](#110-google-integration-setup)
- [1.11 Database migrations](#111-database-migrations)
- [1.12 Related docs](#112-related-docs)

## 1.1 Tech stack

| Layer | Choice |
| ----- | ------ |
| Framework | Next.js 16 (App Router, Turbopack) + TypeScript |
| UI | Mantine v9 (mobile-first; desktop layout at `lg` = 640px) |
| Hosting | Vercel (`main` → production, `dev` → preview) + Cloud Run shadow (`main`-only) — see §1.9 |
| Database | Neon Postgres + Drizzle ORM |
| Auth | NextAuth v4 (Credentials provider, JWT sessions) |
| Google | Service account: Calendar v3 + Gmail v1 (real client when configured, no-op stub otherwise) |
| PWA | Serwist service worker (offline + instant open) |
| Tests | Vitest (unit only, node environment) |

## 1.2 Getting started

```bash
git checkout dev        # day-to-day work happens here; main is production-only
pnpm install
cp .env.example .env.local
# fill in .env.local — at minimum DATABASE_URL, NEXTAUTH_SECRET, ADMIN_INITIAL_PASSWORD
pnpm db:migrate        # apply migrations to Neon (needs DATABASE_URL in the shell — see §1.11)
pnpm db:seed           # optional: default user login keyword (idempotent)
pnpm dev
```

Sign in with the admin password (`ADMIN_INITIAL_PASSWORD` seeds the hash on first
login). Without Google credentials the app runs fully on the stub — calendar views
render empty and event mutations refuse with a clear message
([`google-integration.md`](google-integration.md)).

## 1.3 Scripts

| Command            | Description                                          | Needs DB |
| ------------------ | ---------------------------------------------------- | -------- |
| `pnpm dev`         | Start the dev server (Turbopack)                     | no       |
| `pnpm build`       | Production build                                     | no       |
| `pnpm lint`        | ESLint (flat config)                                 | no       |
| `pnpm typecheck`   | TypeScript check (`tsc --noEmit`)                    | no       |
| `pnpm test`        | Vitest (run once)                                    | no       |
| `pnpm test:watch`  | Vitest in watch mode                                 | no       |
| `pnpm db:generate` | Generate Drizzle migrations from the schema (offline) | no      |
| `pnpm db:migrate`  | Apply generated `drizzle/*.sql` migrations           | yes      |
| `pnpm db:push`     | Push the schema directly — dev convenience only      | yes      |
| `pnpm db:seed`     | Dev seed: default user login keyword (reads `.env.local` itself) | yes |

Run a single test: `pnpm vitest run src/lib/login.test.ts` (or `pnpm test -- <file>`).

## 1.4 Environment variables

The canonical list is [`.env.example`](../.env.example). Values marked *bootstrap*
seed defaults on first run; admins manage them in-app afterwards (Settings).

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | Neon Postgres connection string |
| `NEXTAUTH_SECRET` | Session signing secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App URL for local dev (`http://localhost:3000`). **Leave unset on Vercel** — an empty value breaks prerender; NextAuth falls back to `VERCEL_URL` |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | Base64-encoded GCP service-account JSON key (one env var keeps Vercel secret management simple) |
| `GOOGLE_CLIENT_EMAIL` | Fallback: individual service-account email (used only when the base64 var is empty) |
| `GOOGLE_PRIVATE_KEY` | Fallback: individual private key (`\n` escapes are unescaped automatically) |
| `GOOGLE_DELEGATE_EMAIL` | Workspace account impersonated for Gmail send (KAH breach emails) and granted owner ACLs on department calendars. Leave empty when using `SMTP_URL` instead |
| `SMTP_URL` | SMTP fallback for breach emails, e.g. a personal Gmail app password (`smtp://user:pass@smtp.gmail.com:465`; URL-encode special characters, `smtps:`/465 = implicit TLS) |
| `EMAIL_FROM` | Optional From override (defaults to the SMTP username) |
| `ADMIN_INITIAL_PASSWORD` | Bootstrap: initial admin password, bcrypt-hashed on first login when no admin password exists |

## 1.5 Project structure

```
src/
  app/
    (protected)/            # authenticated routes (AppShell + nav)
      dashboard/            # Calendar page (month/day/week views, wizard, details)
      parade-state/         # Parade state + attendance mode
      contacts/             # Contact list + VCF export
      kah-status/           # Read-only KAH breach history & forecast, ±3 months (member's own groups; admins: all)
      settings/             # Admin hub: users, departments, event-types, templates,
                            # webhooks, quick-links, kah-groups, banner, general, audit-log
    login/                  # Single-input login
    api/auth/[...nextauth]  # NextAuth handler
    api/audit/export        # Audit log CSV export
    sw.ts                   # Serwist service worker (offline + instant open)
    manifest.ts             # PWA manifest
  components/               # Reusable UI (AppShellShell, EventDetail, FilterModal, …)
  db/                       # Drizzle schema + lazy postgres-js client
  lib/
    auth.ts, session.ts     # NextAuth config; role/session guards
    login.ts, bootstrap.ts  # Pure login parsing; settings-row bootstrap
    theme.ts                # Mantine theme (brand colors, breakpoints)
    google/                 # Google integration: contract, real client, stub
    events/                 # Event queries/cache reads, notes codec, title, week matrix
    settings/               # Settings actions/queries, template engine, validation
    roster/                 # Users/departments model, hierarchy helpers
    kah/                    # KAH breach check + status reads
    email/                  # Email transport selection + SMTP
    webhooks/, audit/       # Event webhooks; audit log
    quickLinks/, banner/    # Quick links; announcement banner
    pwa/                    # SW rules + client cache helpers
    ui/, loading/, motion/  # UI state, skeletons/transitions, animation origins
    users/, filters/, eventTypes/, contacts/
  types/                    # NextAuth session augmentation
drizzle/                    # Generated migrations + meta (committed)
docs/                       # Design deep-dives (indexed in §1.12)
```

## 1.6 Testing

- Vitest, node environment; tests are `src/**/*.test.ts` **unit tests** — pure
  helpers only, no DB fixtures or services. Keep decision-making code in pure,
  I/O-free functions (the pattern every subsystem follows).
- Never call DB-backed helpers (e.g. `listAuditLogs`-adjacent functions) with a live
  DB in tests.
- `src/lib/login.ts` is the reference example: parsing is pure and unit-tested
  without a DB.

## 1.7 CI

GitHub Actions runs on every push/PR in this order:

```mermaid
flowchart LR
    A[lint] --> B[typecheck] --> C[test] --> D[db:generate<br/>schema-drift check]
    D -- "push to dev" --> E[migrate-preview<br/>pnpm db:migrate vs dev Neon]
    D -- "push to main" --> F[migrate<br/>pnpm db:migrate vs prod Neon]
    F -- "main only" --> G[deploy-cloudrun<br/>build image + deploy Cloud Run shadow]
```

- The schema-drift check runs `pnpm db:generate` and fails on any diff to
  `drizzle/` — committed migrations must stay in sync with `src/db/schema.ts`.
- Pushes run the matching `migrate` job: `dev` → `migrate-preview` against the dev
  Neon DB (`DATABASE_URL_PREVIEW` secret), `main` → `migrate` against the prod Neon
  DB (`DATABASE_URL` secret) — pending migrations auto-apply per environment on
  deploy. Both jobs are branch-gated with their own concurrency group. PRs only run
  the quality checks.
- `main` pushes additionally run `deploy-cloudrun` (after `migrate`, so migrations
  land before traffic): Docker build → Artifact Registry → Cloud Run, plus env vars
  that mirror Vercel prod (§1.9.1). This is the migration-shadow deployment; Vercel
  keeps deploying independently of `ci.yml`.

## 1.8 Git workflow (cheatsheet)

**All work lands on `dev` first. `main` is production — it only ever advances by
merging `dev`. Never commit directly to `main`.**

```mermaid
flowchart LR
    A[feature branch] -- PR --> B[dev]
    B -- push --> C["CI: quality + migrate-preview (dev Neon)"]
    C --> D["Vercel preview — isolated dev Neon + dev Google account"]
    D -- verify on preview --> B
    B -- merge --> E[main]
    E -- push --> F["CI: migrate (prod Neon) → production"]
```

### Terminal

```bash
# 1. Daily work — every push triggers CI + the Vercel preview
git checkout dev && git pull origin dev
# …edit, commit…
git push origin dev          # verify on the preview URL before shipping

# 2. Ship to prod (only after the preview checks out)
git checkout main && git pull origin main
git merge dev                # merge, never cherry-pick (duplicate SHAs)
git push origin main         # prod deploy + migrate job vs prod Neon

# 3. Verify prod, then back to work
git checkout dev
```

### VS Code

1. **Switch/create branch:** branch indicator in the bottom-left status bar → pick
   `dev` (or "Create new branch…" for risky work, merged back via PR).
2. **Commit & push:** Source Control (`Ctrl+Shift+G`) → stage `＋` → short imperative
   message → **Commit** → **Sync Changes**. The push fires CI + the preview build.
3. **Verify on the preview:** open the latest preview URL (Vercel dashboard), log in
   with the **dev** admin password, exercise the changed flows — isolated dev Neon +
   dev Google account, so prod is untouchable; CI already migrated the dev DB.
4. **Ship:** status bar → switch to `main` → Source Control `…` → **Pull** → command
   palette → **Git: Merge Branch…** → `dev` → `…` → **Push**. Prod deploys; CI runs
   the `migrate` job against the prod DB.
5. **Verify prod** (log in, confirm the change), then switch back to `dev`.
6. **Before any branch switch:** commit or stash (Source Control `…` → **Pull, Push**
   → **Stash** / **Pop Stash**) — or uncommitted work gets stranded.
7. Optionally protect `main` with GitHub branch rules (require PR + CI).

> Env var split per environment: §1.9 · migration mechanics: §1.11

## 1.9 Deployment (Vercel)

Vercel auto-builds on every push: `main` → production, `dev` → preview. The two
environments are **fully isolated**: every environment variable has separate
Production and Preview values (Project → Settings → Environment Variables), pointing
at a dedicated dev Neon project and a dedicated dev Google service account (separate
accounts from prod). Dev activity — events, calendars, ACLs, emails — never touches
prod data.

| Variable | Production | Preview |
| -------- | ---------- | ------- |
| `DATABASE_URL` | prod Neon project | dev Neon project (separate Neon account) |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | prod service-account key | dev service-account key (separate Google account) |
| `NEXTAUTH_SECRET` | prod secret | separate dev secret |
| `ADMIN_INITIAL_PASSWORD` | prod admin password | dev-only password |
| `SMTP_URL` / `EMAIL_FROM` | prod email transport | test inbox (the dev Google account's own Gmail app password) |
| `GOOGLE_DELEGATE_EMAIL` | Workspace delegate for Gmail send | unset — dev uses `SMTP_URL` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | `1` |
| `NEXTAUTH_URL` | unset | unset |

- `ENABLE_EXPERIMENTAL_COREPACK` = `1` — makes Vercel honor the `packageManager`
  field (pnpm `11.18.0`). Without it, Vercel detects pnpm 10 from the lockfile,
  which ignores `allowBuilds` and emits "Ignored build scripts" warnings for
  `esbuild`, `sharp`, and `unrs-resolver`.
- Leave `NEXTAUTH_URL` **unset on Vercel** — Vercel injects `VERCEL_URL` and
  NextAuth falls back to it. An empty value fails the build with `TypeError:
  Invalid URL` during prerender. On the Cloud Run shadow it **must be set** to the
  service's `*.run.app` URL (§1.9.1) — there is no `VERCEL_URL` fallback there.

> **Warning:** never point a data-copied database (e.g. a Neon branch of prod) at a
> different service account — the `calendars` table stores **Google calendar IDs**, so
> copied rows would target the wrong calendars. The dev database is a fresh,
> migrations-only database with no seeded departments or users (`db:seed` only
> defaults the user login keyword — it never fabricates calendar rows);
> departments are recreated in-app so `createCalendar` makes real calendars under the
> dev service account.

Migrations reach each database via CI (`ci.yml`): pushes to `main` run `pnpm
db:migrate` with the `DATABASE_URL` secret (prod DB); pushes to `dev` run it with
`DATABASE_URL_PREVIEW` (dev DB). Both jobs are branch-gated with their own
concurrency group.

Native build scripts for `esbuild`, `sharp`, and `unrs-resolver` are approved via
`allowBuilds` in `pnpm-workspace.yaml` (pnpm 11 format).

## 1.9.1 Cloud Run shadow deployment

While the Vercel → Cloud Run migration is ongoing, the **same commit** builds and
runs on both platforms from one codebase. Vercel remains the live production and
preview; a `main`-only GitHub Actions job (`deploy-cloudrun` in `ci.yml`) deploys a
**shadow** Cloud Run service that mirrors Vercel prod (same code, same prod Neon,
same prod Google service account).

- **Platform split lives in env/config, never in `src/`.** The Docker image runs
  the regular `next start` server over the full `.next` build — no
  Cloud Run-specific config exists in `next.config.ts`, so Vercel's build is
  byte-identical to a Vercel-only setup. There is no `VERCEL_URL` coupling
  anywhere in `src/`.
- **Container**: multi-stage `Dockerfile` (`node:24-slim`): `pnpm install
  --frozen-lockfile` (`.npmrc` carries resilient fetch settings; `pnpm-workspace.yaml`
  the `allowBuilds` list) → `pnpm build` → runtime copies the full `node_modules`,
  `.next`, and `public/`, then `next start -H 0.0.0.0 -p 8080`. The full
  `node_modules` copy is deliberate: pnpm's isolated (symlinked) layout makes
  `output: "standalone"` tracing drop packages (e.g. `@swc/helpers` →
  `MODULE_NOT_FOUND`), and forcing a hoisted layout would fork the repo's install
  config — image size is the cheaper trade. Build context is trimmed by
  `.dockerignore`. Pure-JS runtime deps (bcryptjs, no native modules).
- **Service config** (request-based billing = CPU throttled, scale-to-zero):
  1 vCPU / 1 GiB / concurrency 20 / min-instances 0 / max-instances 4 /
  allow-unauthenticated (login is public). Region `asia-east1`. The first deploy
  rolls a placeholder revision; the job then reads its `*.run.app` URL and issues
  `gcloud run services update` setting all env vars (via `--env-vars-file`, so
  values may contain commas/`=`) plus `NEXTAUTH_URL` — a second revision seconds
  later.
- **Env vars** mirror Vercel **Production**: `DATABASE_URL`, `NEXTAUTH_SECRET`
  (same value — harmless since sessions are per-origin), `GOOGLE_SERVICE_ACCOUNT_BASE64`,
  `GOOGLE_DELEGATE_EMAIL`, `SMTP_URL`, `EMAIL_FROM`, `ADMIN_INITIAL_PASSWORD`.
  Cloud Run does not block SMTP ports 465/587, so the nodemailer fallback works.
- **One-time GCP setup** (console): project + billing account (card; Always-Free
  tier applies) → enable Cloud Run Admin + Artifact Registry → create Artifact
  Registry repo `cloudy2` in `asia-east1` → create a deploy service account
  (`roles/run.admin` + `roles/artifactregistry.writer`), store its JSON key as the
  GitHub secret `GCP_SA_KEY`. Additional required GitHub secrets (mirroring Vercel
  prod): `GCP_PROJECT_ID`, `DATABASE_URL`, `NEXTAUTH_SECRET`,
  `GOOGLE_SERVICE_ACCOUNT_BASE64`, `GOOGLE_DELEGATE_EMAIL`, `SMTP_URL`,
  `EMAIL_FROM`, `ADMIN_INITIAL_PASSWORD`. Set a budget alert (~$5) as a guard.
- **Shadow caveats**: both instances share prod Neon + the prod service account.
  Read-only validation (login, month views, search, audit CSV, PWA) is
  zero-risk; mutation tests (create/edit events, adding departments — which
  creates real Google calendars) touch prod data twice, so keep them to admins and
  create-then-delete. Sessions are per-origin: a user logged into Vercel must log
  in again on the `*.run.app` URL.
- **Cutover** (when ready): disable/delete the Vercel project + delete
  `vercel.json` (nothing to change in `next.config.ts` — no Cloud Run-specific
  config exists). Abort path: delete the Cloud Run service — Vercel is untouched.
  Both are deployment decisions, not code changes.

## 1.10 Google integration setup

All Google access goes through `getGoogleIntegration()`
([`google-integration.md`](google-integration.md)):

- **Credentials** — set `GOOGLE_SERVICE_ACCOUNT_BASE64` (preferred), or
  `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY` as a fallback. With credentials the
  app uses the real Calendar v3 client (calendar lifecycle, event read/write, ACL
  sharing); without them it runs on a no-op stub so dev/CI need no GCP account.
- **Gmail send** (KAH breach emails) — requires Workspace domain-wide delegation:
  set `GOOGLE_DELEGATE_EMAIL` to the account to impersonate and grant the service
  account the `gmail.send` scope in the Workspace admin console. Deployments without
  Workspace can use the `SMTP_URL` fallback instead; with neither, breaches stay
  audit-only ([`kah.md`](kah.md)).
- **Delegate ACLs** — `GOOGLE_DELEGATE_EMAIL` also receives owner access on every
  department calendar ([`roster-sharing.md`](roster-sharing.md)).

## 1.11 Database migrations

Schema lives in `src/db/schema.ts`; `drizzle.config.ts` generates into `drizzle/`.
The workflow for changing the schema:

```bash
pnpm db:generate   # no DB needed — writes drizzle/*.sql + drizzle/meta/ from the schema
# commit BOTH the generated drizzle/*.sql migration and the drizzle/meta/ files
pnpm db:migrate    # apply pending migrations to Neon
```

Migrations run in filename order. Each applied migration is recorded in a
`__drizzle_migrations` table inside the database, so re-running `pnpm db:migrate`
only applies files that haven't been applied yet — safe and idempotent.

`db:generate` needs no database. `db:migrate` and `db:push` connect to Neon and
**require `DATABASE_URL` in the shell environment** — `drizzle-kit` does **not**
read `.env.local`, so running them directly fails with `Please provide required
params for Postgres driver: url: ''`. On Windows PowerShell, load the variable
first:

```powershell
$line = Get-Content .env.local | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$env:DATABASE_URL = $line.Substring(13).Trim()
pnpm db:migrate
```

In CI, the schema-drift check runs `pnpm db:generate` then fails on any diff to
`drizzle/`, and the `migrate` job applies pending migrations on `main` pushes
(§1.7).

## 1.12 Related docs

| Document | Covers |
| -------- | ------ |
| [`user-guide.md`](user-guide.md) | End-user guide: login, calendar views, events, PWA/offline |
| [`admin-guide.md`](admin-guide.md) | Admin guide: every Settings tab, sharing, KAH, audit log |
| [`google-integration.md`](google-integration.md) | Google layer contract, real client + stub, error mapping |
| [`events-cache.md`](events-cache.md) | Google Calendar event caching — design, flows, freshness |
| [`event-search.md`](event-search.md) | Free-text event search (direct Google `q`, lazy-loaded modal) |
| [`event-lifecycle.md`](event-lifecycle.md) | Event wizard → Google: notes codec, titles, location policy |
| [`event-mutations.md`](event-mutations.md) | Create/update/delete: copy reconciliation, rollbacks, audit |
| [`roster-sharing.md`](roster-sharing.md) | Users/departments model, hierarchy, calendar ACL sharing, colors |
| [`kah.md`](kah.md) | KAH groups, breach check, email transports |
| [`webhooks.md`](webhooks.md) | Event webhooks: payloads, HMAC signatures, fan-out delivery |
| [`audit-log.md`](audit-log.md) | Audit log: schema, retention, pagination, CSV export |
| [`pwa-offline.md`](pwa-offline.md) | Service worker: SWR caches, build versioning, offline fallback |
| [`ui-state.md`](ui-state.md) | The `cloudy2.ui` cookie, launch targeting, pinned tabs |
| [`loading-transitions.md`](loading-transitions.md) | Skeleton-only loading, fades, optimistic nav chrome |
| [`desktop-responsive.md`](desktop-responsive.md) | The `lg` breakpoint, sidebar shell, tables/card-grids |
| [`dashboard-views.md`](dashboard-views.md) | View inventory, filter menus, Week (D) matrix |
| [`grid-pan.md`](grid-pan.md) | Drag-to-pan + edge buttons for the wide grids |
| [`immersive-mode.md`](immersive-mode.md) | Fullscreen calendar mode |
| [`quick-links.md`](quick-links.md) | Admin-managed quick links |
| [`announcement-banner.md`](announcement-banner.md) | Announcement banner + height-var chain |
| [`pinned-events.md`](pinned-events.md) | Pinned Events panel + badge refresh |
| [`user-picker.md`](user-picker.md) | No-keyboard selects + the badge-dialog picker |
| [`accessibility.md`](accessibility.md) | Skip link, live-region announcements, skeleton a11y |

Working documents (not end-user documentation): [`AGENTS.md`](../AGENTS.md) (agent
rules), [`progress.md`](../progress.md) (status + changelog),
[`progress-archive.md`](../progress-archive.md) (phase history), and the historical
plans under `.opencode/plans/` and `tasks/`.
