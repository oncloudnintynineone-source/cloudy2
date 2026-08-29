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
| UI | Mantine v9 (mobile-first; desktop layout at `lg` = 992px) |
| Hosting | Vercel (`main` → production, `dev` → preview) |
| Database | Neon Postgres + Drizzle ORM |
| Auth | NextAuth v4 (Credentials provider, JWT sessions) |
| Google | Service account: Calendar v3 + Gmail v1 (real client when configured, no-op stub otherwise) |
| PWA | Serwist service worker (offline + instant open) |
| Tests | Vitest (unit only, node environment) |

## 1.2 Getting started

```bash
pnpm install
cp .env.example .env.local
# fill in .env.local — at minimum DATABASE_URL, NEXTAUTH_SECRET, ADMIN_INITIAL_PASSWORD
pnpm db:migrate        # apply migrations to Neon (needs DATABASE_URL in the shell — see §1.11)
pnpm db:seed           # optional: dev departments/users/memberships (idempotent)
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
| `pnpm db:seed`     | Dev seed: departments/users/memberships (reads `.env.local` itself) | yes |

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
      kah-status/           # Read-only KAH status for group members
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
    D -- "push to main" --> E[migrate<br/>pnpm db:migrate vs Neon]
```

- The schema-drift check runs `pnpm db:generate` and fails on any diff to
  `drizzle/` — committed migrations must stay in sync with `src/db/schema.ts`.
- Pushes to `main` additionally run the `migrate` job against Neon using the
  `DATABASE_URL` repo secret, so pending migrations auto-apply on deploy. PRs only
  run the quality checks.

## 1.8 Git workflow

`dev` is the working branch; `main` is production. All day-to-day work happens on
`dev` (or short-lived feature branches off it), and `main` only moves forward when
`dev` is ready to ship.

```mermaid
flowchart LR
    A[Feature branch] -- PR --> B[dev]
    B -- push --> C[CI + Vercel preview]
    C -- passes --> B
    B -- git merge dev --> D[main]
    D --> E[Production]
```

1. **Work on `dev`.** Commit directly, or branch off `dev` for anything risky and
   merge back with a PR. Every push to `dev` triggers CI + a Vercel preview build.
2. **Keep `dev` deployable.** CI must pass before pushing. Preview builds serve as
   the integration check.
3. **Ship with a merge, never a cherry-pick.** When `dev` is production-ready:

   ```bash
   git checkout main
   git merge dev
   git push origin main
   ```

   Always move changes between `dev` and `main` with `git merge` — cherry-picking
   the same commits across branches creates duplicate commits with different SHAs
   (as happened early in this repo).
4. **Finish or stash before switching branches.** Commit or stash your working tree
   before `git checkout`, or untracked/uncommitted work gets stranded on whichever
   branch you landed on.
5. **Optionally protect `main`** with branch rules (require a PR + passing CI) so
   nothing reaches production unreviewed.

## 1.9 Deployment (Vercel)

Vercel auto-builds on every push: `main` → production, `dev` → preview.

Required configuration (Project → Settings → Environment Variables):

- `ENABLE_EXPERIMENTAL_COREPACK` = `1` — makes Vercel honor the `packageManager`
  field (pnpm `11.18.0`). Without it, Vercel detects pnpm 10 from the lockfile,
  which ignores `allowBuilds` and emits "Ignored build scripts" warnings for
  `esbuild`, `sharp`, and `unrs-resolver`.
- `DATABASE_URL` — Neon Postgres connection string.
- `NEXTAUTH_SECRET` — session signing secret.
- `ADMIN_INITIAL_PASSWORD` — seeds the admin password hash on first login.
- Google service-account vars (§1.10) and, optionally, an email transport
  (`GOOGLE_DELEGATE_EMAIL` or `SMTP_URL`) for KAH breach emails.
- Leave `NEXTAUTH_URL` **unset** — Vercel injects `VERCEL_URL` and NextAuth falls
  back to it. An empty value fails the build with `TypeError: Invalid URL` during
  prerender.

Native build scripts for `esbuild`, `sharp`, and `unrs-resolver` are approved via
`allowBuilds` in `pnpm-workspace.yaml` (pnpm 11 format).

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

Working documents (not end-user documentation): [`AGENTS.md`](../AGENTS.md) (agent
rules), [`progress.md`](../progress.md) (status + changelog),
[`progress-archive.md`](../progress-archive.md) (phase history), and the historical
plans under `.opencode/plans/` and `tasks/`.
