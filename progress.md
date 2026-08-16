# Cloudy2 — Progress

Internal tool for managing company personnel, leave/event records, and Key Appointment
Holder (KAH) constraints, with Google Calendar as the event/visibility layer.

## Status

- **Phase 0 (spec & decisions):** complete
- **Phase 1 (scaffold):** complete — builds, lints, typechecks, and tests pass locally
- **Deployment (Vercel):** in progress — build was failing; fixes committed, awaiting
  final Vercel env config + redeploy

## Decisions locked in (Phase 0)

| Topic                    | Decision                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| Architecture             | Single Next.js 15 (App Router) app — no monorepo                          |
| UI                       | Mantine v9                                                               |
| Database                 | Neon Postgres + Drizzle ORM                                              |
| Auth                     | NextAuth v4, Credentials provider, **JWT sessions**                       |
| Login UX                 | Single input field, auto-detect: admin password vs `[phone][keyword]`    |
| Google integration       | GCP service account (Calendar v3 + Gmail v1); domain-wide delegation     |
| GCal notes               | JSON block stored on events                                              |
| Calendars                | Department-level calendars                                               |
| Parade states            | `parade_states` lookup table (code/label/description)                    |
| Settings                 | Single-row `settings` table (admin password hash, keyword, KAH %)        |
| User→dept                | Many-to-many `user_departments` with `is_primary` flag                   |
| PWA / monorepo           | Deferred / not used                                                      |

## Implemented (Phase 1)

### Tooling
- Next.js `15.5.23` (Turbopack), React 19, TypeScript, pnpm `11.18.0`
- `packageManager` + `engines` pinned in `package.json`
- Mantine v9 wired via `postcss.config.cjs` + `MantineProvider` + `optimizePackageImports`
- Drizzle `0.45.2` + `postgres-js`; Vitest `4.1.10`; ESLint 9 + Prettier
- Native build scripts approved in `pnpm-workspace.yaml` (`allowBuilds`: esbuild, sharp,
  unrs-resolver)
- CI workflow (`.github/workflows/ci.yml`): lint, typecheck, test, schema-drift check

### Database schema (`src/db/schema.ts`)
7 tables: `users`, `departments`, `user_departments`, `calendars`, `acronyms`,
`parade_states`, `settings`. Lazy DB client (`src/db/index.ts`) avoids requiring
`DATABASE_URL` at build time. Migration generated at `drizzle/0000_serious_ezekiel_stane.sql`.

### Auth & routing
- `src/lib/auth.ts` — NextAuth config: Credentials + JWT, admin/user resolution, JWT/session
  callbacks that carry `id`, `role`, `phone`
- `src/lib/login.ts` — pure (I/O-free) login parsing: `parseUserLogin`, `classifyLogin`
- `src/lib/session.ts` — `requireSession`, `requireAdmin`, `getSession` guards
- `src/types/next-auth.d.ts` — session/JWT type augmentation
- `src/app/api/auth/[...nextauth]/route.ts` — auth handler
- `src/app/login/page.tsx` + `src/components/LoginForm.tsx` — login page + form
- `src/app/(protected)/layout.tsx` + `dashboard/page.tsx` + `AppShellShell` — protected
  dashboard shell
- `src/components/` — `AcronymBadge`, `CalendarSelect`

### Google integration (stub)
- `src/lib/google/types.ts` — `GoogleIntegration` interface
- `src/lib/google/stub.ts` — no-op implementation
- `src/lib/google/index.ts` — `getGoogleIntegration()` returns the stub until credentials
  are provisioned

### Tests
- `src/lib/login.test.ts` — 8 passing tests (login parsing)

## Verification status

| Check              | Result |
| ------------------ | ------ |
| `pnpm build`       | pass   |
| `pnpm lint`        | pass   |
| `pnpm typecheck`   | pass   |
| `pnpm test`        | 8/8    |
| `pnpm db:generate` | 7 tables, 1 migration |

## Deployment (Vercel) — current blocker & fix

Vercel auto-builds: `main` → production, `dev` → preview.

Two issues were diagnosed and fixed in-repo (committed and pushed to both `dev` and `main`):

1. **`TypeError: Invalid URL` during `/login` prerender.** Caused by an empty
   `NEXTAUTH_URL` env var (NextAuth's `parseUrl` does `new URL('')`). Fix: leave
   `NEXTAUTH_URL` **unset** on Vercel — it injects `VERCEL_URL` and NextAuth falls back
   automatically.
2. **"Ignored build scripts" warning** (esbuild, sharp, unrs-resolver). Root cause: Vercel
   detects pnpm **10** from `lockfileVersion: 9.0` and ignores the pnpm-11 `allowBuilds`
   config. Fix: enable Corepack so Vercel honors `packageManager: pnpm@11.18.0`.

### Remaining manual steps (Vercel dashboard)
- [ ] Add `ENABLE_EXPERIMENTAL_COREPACK` = `1`
- [ ] Add `NEXTAUTH_SECRET` (`openssl rand -base64 32`) — done per user
- [ ] Add `DATABASE_URL` (Neon) — done per user
- [ ] Remove any empty `NEXTAUTH_URL`
- [ ] Redeploy and confirm build passes

## Next steps (Phase 2+)

1. Confirm successful Vercel build/deployment.
2. Apply schema to Neon (`pnpm db:push` or `pnpm db:migrate`).
3. Replace the Google stub with a real service-account implementation
   (calendar event read/write, Gmail send-as, KAH visibility).
4. Build admin setup flow (initial admin password hash → `settings` row).
5. Implement core screens: personnel roster, leave/event entry, KAH constraint checks,
   parade states, acronyms, calendar view.
6. Gmail notifications for KAH percentage breaches.

## Git history

```
c2e1a68 Document Vercel Corepack requirement and env setup
d914aca Fix pnpm build scripts and pin package manager/Node
e04140f Phase 1 scaffold
8e60883 Initial commit from Create Next App
```
