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

## Conventions

- UI is **Mantine v9**; theme in `src/lib/theme.ts`, provider in `src/app/layout.tsx`.
  Authenticated routes live under `src/app/(protected)/` inside the AppShell.
- **The app is strictly mobile-only.** There is no sidebar or hamburger menu. Lists render
  as stacked **card lists** (`Paper` per row), never `<Table>`. Modals are **floating**
  dialogs: `centered` with a fixed `size` (never `fullScreen` — they must not fill the full
  screen width). Keep this pattern for all new UI.
- **Admin settings live under `/settings`** (admin-only), reached via the profile icon in the
  header. A horizontal scrollable `SettingsTabs` bar (`src/app/(protected)/settings/`)
  switches between the Users (`/settings/users`), Departments (`/settings/departments`), and
  General (`/settings/general`) tabs.
- **Always show a loading skeleton for async loads.** Any route or view that awaits data
  before rendering (DB queries, fetches) must show a Mantine `Skeleton` fallback instead of
  a blank screen. In the App Router add a `loading.tsx` to the route segment (auto Suspense
  fallback, e.g. `src/app/(protected)/settings/users/loading.tsx`); for client-side async use
  a `Skeleton` state. Shape the skeleton to match the real card list.
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
