# Dev environment isolation — execution plan

> **Status 2 (bugfix pending):** Steps 1–6 done and verified (CI green, migrate-preview
> success). Login on the dev preview exposed a **prod-shared bug**: admin-password
> sessions carry synthetic `id: "admin"` (`src/lib/auth.ts:43`) and the protected
> layout's `userHasKahGroup(session.user.id)` queries the uuid column
> `kah_group_members.user_id` with it → Postgres 22P02 → whole protected tree 500s.
> `main` has the same latent crash (arrived with `1e0cabd`/`9bf2600`). Approved plan:
> guard + tests → dev → verify preview → merge to main.

## Bugfix edits (apply in build mode)

### `src/lib/kah/status.ts` — 3 edits

a) Insert above `eventTakesMembersOverseas`:

```ts
/**
 * Whether the id is a real roster-user UUID. Session identities are not always
 * roster rows — the bootstrap admin password signs in as the synthetic
 * `id: "admin"` (`auth.ts` authorize), and a uuid-typed column query (e.g.
 * `kah_group_members.user_id`) would fail Postgres's cast on such an id.
 * Pure so it can be unit-tested without a database.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}
```

b) `kahGroupsForUser` — first lines become:

```ts
export async function kahGroupsForUser(userId: string): Promise<KahGroupCheck[]> {
  // Non-UUID identities (the synthetic bootstrap admin) are not roster rows,
  // hence belong to no KAH group — skip the uuid-typed query entirely.
  if (!isUuid(userId)) {
    return [];
  }
  const all = await listKahGroupChecks();
```

c) `userHasKahGroup` — first lines become:

```ts
export async function userHasKahGroup(userId: string): Promise<boolean> {
  // Non-UUID identities (the synthetic bootstrap admin) are not roster rows —
  // skip the uuid-typed query entirely (this runs on every protected render).
  if (!isUuid(userId)) {
    return false;
  }
  const rows = await db
```

### `src/lib/kah/status.test.ts` — append

```ts
describe("isUuid", () => {
  it("accepts canonical UUIDs", () => {
    expect(isUuid("0b8d5f2e-1c47-4a90-9d3e-6f1a2b3c4d5e")).toBe(true);
    expect(isUuid("0B8D5F2E-1C47-4A90-9D3E-6F1A2B3C4D5E")).toBe(true);
  });

  it("rejects synthetic non-roster identities and malformed ids", () => {
    expect(isUuid("admin")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("0b8d5f2e1c474a909d3e6f1a2b3c4d5e")).toBe(false);
    expect(isUuid("0b8d5f2e-1c47-4a90-9d3e-6f1a2b3c4d5")).toBe(false);
  });
});
```

(also add `isUuid` to the existing `import { ... } from "./status"` line)

### Docs (repo convention)

- `progress.md` §1.3: append one-liner after 1.140:
  `- 1.141 Bootstrap-admin KAH crash fix: admin-password sessions carry the synthetic id "admin" (no user row), so the protected layout's userHasKahGroup / kah-status page's kahGroupsForUser sent it against the uuid column kah_group_members.user_id and Postgres rejected the cast (22P02) — 500 on every admin login since the KAH integration; both queries now guard with pure isUuid (unit-tested) and treat non-UUID ids as "no KAH groups" (bugfix)`
- `progress-archive.md`: append `## 1.141 Bootstrap-admin KAH crash fix (bugfix)` write-up + TOC entry.

### Ship sequence

1. `pnpm test` + `pnpm lint` + `pnpm typecheck`
2. Commit on `dev` ("Fix admin-login crash: guard uuid-typed KAH queries"), push
3. Watch CI (quality + migrate-preview)
4. User verifies dev preview: admin login renders shell → set up departments/users
5. On confirmation: `git checkout main; git merge dev; git push origin main` (prod gets the same fix)

---

## Goal

`dev` branch → Vercel preview must run against a **dedicated dev Neon project** and a
**dedicated dev Google service account** (separate accounts from prod), so dev activity
never touches prod data. Decisions: fresh empty dev DB (migrations only, **no
`db:seed`** — it inserts fake calendar IDs like `dept-operations@cloudy.local` that
break a real SA); separate service account under a new Google account; CI migrate job
on `dev` pushes; dev KAH emails via the new Google account's own Gmail app password
(`SMTP_URL`).

## Completed

1. **Neon dev DB** — new Neon account/project created; pooled connection string
   verified (`SELECT 1` OK, Postgres 18.6); `pnpm db:migrate` applied — all 14 tables
   confirmed via `information_schema`.
2. Verified prod `.env.local` uses a pooled Neon URL (dev matches that style).

## Pending repo edits (blocked by plan mode — apply in build mode)

### 1. `.github/workflows/ci.yml` — append `migrate-preview` job after the existing `migrate` job

```yaml
  migrate-preview:
    runs-on: ubuntu-latest
    needs: quality
    if: github.ref == 'refs/heads/dev'
    concurrency:
      group: db-migrate-preview
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v6

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Apply database migrations (preview DB)
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PREVIEW }}
        run: pnpm db:migrate
```

### 2. `AGENTS.md` — replace the `main` → production, `dev` → preview bullet in
"Vercel / env gotchas" with:

```markdown
- `main` → production, `dev` → preview. **Environments are fully isolated**: every
  Vercel env var has separate Production/Preview values — prod Neon project + prod
  service account vs a dedicated dev Neon project + dev service account (separate
  accounts). CI runs `pnpm db:migrate` on `main` pushes (`DATABASE_URL` secret) and on
  `dev` pushes (`DATABASE_URL_PREVIEW` secret), each against its own DB. **Never point
  a data-copied DB at a different service account** — the `calendars` table stores
  Google calendar IDs (dev DB is migrations-only; departments are recreated in-app).
  Copy `.env.example` → `.env.local` for local dev; required vars: `DATABASE_URL`,
  `NEXTAUTH_SECRET`, `ADMIN_INITIAL_PASSWORD` (seeds the admin password hash on first
  run), plus Google service-account vars.
```

### 3. `docs/developer-guide.md` — replace §1.9 body with the per-environment table

```markdown
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
- Leave `NEXTAUTH_URL` **unset** — Vercel injects `VERCEL_URL` and NextAuth falls
  back to it. An empty value fails the build with `TypeError: Invalid URL` during
  prerender.

> **Warning:** never point a data-copied database (e.g. a Neon branch of prod) at a
> different service account — the `calendars` table stores **Google calendar IDs**, so
> copied rows would target the wrong calendars. The dev database is a fresh,
> migrations-only database (`db:seed` is skipped — it inserts fake calendar IDs);
> departments are recreated in-app so `createCalendar` makes real calendars under the
> dev service account.

Migrations reach each database via CI (`ci.yml`): pushes to `main` run `pnpm
db:migrate` with the `DATABASE_URL` secret (prod DB); pushes to `dev` run it with
`DATABASE_URL_PREVIEW` (dev DB). Both jobs are branch-gated with their own
concurrency group.
```

### 4. `progress.md` — two edits

a) Append to §1.3 changelog (after the 1.139 line):

```markdown
- 1.140 Dev environment isolation: `dev` → preview now runs on a dedicated dev Neon
  project + dev Google service account (separate accounts from prod); Vercel env vars
  split per environment, CI `migrate-preview` job on `dev` pushes, docs updated
```

b) Replace the §1.5 Deployment & environments bullets:

```markdown
- Vercel auto-builds: `main` → production, `dev` → preview, with **fully isolated
  environments** — separate Neon account (dev DB is migrations-only; no `db:seed`, its
  fake calendar IDs break a real SA) and separate Google account (dev service account;
  departments recreated in-app so dev gets its own calendars). Pending migrations
  auto-apply per environment via CI: `main` push → prod DB (`DATABASE_URL` secret),
  `dev` push → dev DB (`DATABASE_URL_PREVIEW` secret).
- Env vars are set per environment on Vercel — see `docs/developer-guide.md` §1.9 for
  the Production/Preview table. Leave `NEXTAUTH_URL` unset; set
  `ENABLE_EXPERIMENTAL_COREPACK = 1`. Canonical gotchas live in AGENTS.md.
```

### 5. `progress-archive.md` — append Phase 1.140 write-up (per archive convention:
full notes here, one-liner in progress.md). Content: decisions (separate accounts,
fresh DB, no seed), the calendars-table warning, env-split table pointer to
developer-guide §1.9, CI job, verification notes. Add matching TOC entry
(`- [1.140 ...]` at the end of the archive's TOC list).

## Pending console steps (user, parallel — no repo dependency)

### A. Google dev service account (new Google account)
1. console.cloud.google.com (signed in as the new account) → create project `cloudy2-dev`.
2. APIs & Services → Library → enable **Google Calendar API**.
3. IAM & Admin → Service Accounts → create `cloudy2-dev` → Keys → Add key → JSON → download.
4. Base64 (PowerShell, single line):
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("<path>\key.json")) | Set-Clipboard`
5. Gmail app password for the same account: Google Account → Security → 2-Step
   Verification → App passwords → generate → keep for Vercel `SMTP_URL`
   (`smtp://<user>%40gmail.com:<16char>@smtp.gmail.com:465`).

### B. GitHub secret
- Repo → Settings → Secrets and variables → Actions → new secret
  `DATABASE_URL_PREVIEW` = the dev Neon pooled connection string.

### C. Vercel env split (Project → Settings → Environment Variables)
Convert each single value into Production/Preview values:

| Var | Production (keep) | Preview (new) |
|---|---|---|
| `DATABASE_URL` | existing | dev Neon pooled URL |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | existing | dev SA base64 |
| `NEXTAUTH_SECRET` | existing | new `openssl rand -base64 32` |
| `ADMIN_INITIAL_PASSWORD` | existing | dev password |
| `SMTP_URL` + `EMAIL_FROM` | existing | dev Gmail app-password URL |
| `GOOGLE_DELEGATE_EMAIL` | existing | remove from Preview |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | `1` (unchanged) |
| `NEXTAUTH_URL` | unset | unset |

Then redeploy the latest `dev` deployment so the preview picks up new values.

## Verification checklist

1. Preview URL → login with dev admin password; empty roster (migrations only).
2. Create departments in-app → calendars appear owned by the dev SA, not prod's.
3. Create a test event on dev → shows in dev calendar + dev Neon only; prod URL/DB/calendar untouched.
4. Trigger a KAH breach → email lands in the dev Gmail inbox.
5. Push to `dev` → CI `migrate-preview` job applies pending migrations to dev DB.
6. `main` deploy unaffected.
