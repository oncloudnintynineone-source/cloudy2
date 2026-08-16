# Cloudy

Cloud Calendar Movement — an internal tool for managing company personnel, leave/event
records, and Key Appointment Holder (KAH) constraints, with Google Calendar as the
event/visibility layer.

## Tech stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **UI:** Mantine v9
- **Hosting:** Vercel (dev previews from `dev` branch, prod from `main`)
- **Database:** Neon Postgres + Drizzle ORM
- **Auth:** NextAuth v4 (Credentials provider, JWT sessions)
- **Google:** Service account for Calendar v3 + Gmail v1 (currently stubbed)

## Getting started

```bash
pnpm install
cp .env.example .env.local
# fill in .env.local (see Environment below)
pnpm db:push          # create/update schema in Neon
pnpm dev
```

## Scripts

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `pnpm dev`         | Start the dev server (Turbopack)         |
| `pnpm build`       | Production build                          |
| `pnpm lint`        | ESLint                                    |
| `pnpm typecheck`   | TypeScript check                          |
| `pnpm test`        | Vitest (run once)                         |
| `pnpm test:watch`  | Vitest in watch mode                      |
| `pnpm db:generate` | Generate Drizzle migrations               |
| `pnpm db:push`     | Push schema directly to the database      |
| `pnpm db:migrate`  | Apply generated migrations                |

## Environment

| Variable                          | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `DATABASE_URL`                    | Neon Postgres connection string                |
| `NEXTAUTH_SECRET`                 | Session signing secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL`                    | App URL (default `http://localhost:3000`)      |
| `GOOGLE_SERVICE_ACCOUNT_BASE64`   | Base64-encoded GCP service account JSON key    |
| `GOOGLE_CLIENT_EMAIL`             | Fallback service account email                 |
| `GOOGLE_PRIVATE_KEY`              | Fallback service account private key           |
| `GOOGLE_DELEGATE_EMAIL`           | Workspace delegate for Gmail send-as / ACL     |

## Login

Single input field. The server auto-detects:

- **Admin** — enter the admin password.
- **User** — enter `[phone][keyword]`, e.g. `91234567leave`.

## Project structure

```
src/
  app/
    (protected)/          # authenticated routes (AppShell + nav)
    api/auth/[...nextauth] # NextAuth handler
    login/                 # login page
  components/              # reusable UI (LoginForm, AppShellShell, CalendarSelect, ...)
  db/                      # Drizzle schema + client
  lib/
    auth.ts                # NextAuth config
    session.ts             # session/role guards
    login.ts               # pure login parsing (unit tested)
    google/                # Google integration interface + stub
  types/                   # NextAuth type augmentation
```

## CI

GitHub Actions runs lint, typecheck, test, and a schema-drift check on every push/PR.
Quality gates only — Vercel handles deployments from `dev` and `main`.

## Git workflow

`dev` is the working branch; `main` is production. All day-to-day work happens on `dev`
(or short-lived feature branches off it), and `main` only moves forward when `dev` is
ready to ship.

1. **Work on `dev`.** Commit directly, or branch off `dev` for anything risky and merge
   back with a PR. Every push to `dev` triggers CI + a Vercel preview build.
2. **Keep `dev` deployable.** CI must pass before pushing. Preview builds serve as the
   integration check.
3. **Ship with a merge, never a cherry-pick.** When `dev` is production-ready:

   ```bash
   git checkout main
   git merge dev
   git push origin main
   ```

   Always move changes between `dev` and `main` with `git merge` — cherry-picking the
   same commits across branches creates duplicate commits with different SHAs (as happened
   early in this repo). Merge keeps history linear and each commit existing once.
4. **Finish or stash before switching branches.** Commit or stash your working tree before
   `git checkout`, or files left untracked/uncommitted get stranded on whichever branch you
   happened to land on.
5. **Optionally protect `main`** with branch rules (require a PR + passing CI) so nothing
   reaches production unreviewed.

## Deployment (Vercel)

Vercel auto-builds on every push: `main` → production, `dev` → preview.

Required configuration:

1. **Environment variables** (Project → Settings → Environment Variables):
   - `ENABLE_EXPERIMENTAL_COREPACK` = `1` — makes Vercel honor the
     `packageManager` field (pnpm `11.18.0`). Without it, Vercel falls back to pnpm 10
     (detected from `lockfileVersion: 9.0`), which ignores `allowBuilds` and emits the
     "Ignored build scripts" warning for `esbuild`, `sharp`, and `unrs-resolver`.
   - `DATABASE_URL` — Neon Postgres connection string.
   - `NEXTAUTH_SECRET` — session signing secret (`openssl rand -base64 32`).
   - Leave `NEXTAUTH_URL` **unset** — Vercel injects `VERCEL_URL` and NextAuth falls
     back to it automatically. Do not add it as an empty value, or the build fails with
     `TypeError: Invalid URL` during prerender.

2. Native build scripts for `esbuild`, `sharp`, and `unrs-resolver` are approved via
   `allowBuilds` in `pnpm-workspace.yaml` (pnpm 11 format).

## Google integration (stub)

Google Calendar/Gmail calls go through `getGoogleIntegration()`, which currently
returns a no-op stub. A real service-account implementation will be added once GCP
credentials and Workspace domain-wide delegation are provisioned.
