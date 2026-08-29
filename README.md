# 1. Cloudy

Cloud Calendar Movement — an internal tool for managing company personnel,
leave/event records, and Key Appointment Holder (KAH) constraints, with Google
Calendar as the event/visibility layer. Single Next.js 16 (App Router) app, no
monorepo.

## Table of contents

- [1.1 Features](#11-features)
- [1.2 Tech stack](#12-tech-stack)
- [1.3 Quick start](#13-quick-start)
- [1.4 Documentation](#14-documentation)

## 1.1 Features

- **Calendar across departments** — Month / Week (H) / Week (D) / Day / Agenda views
  over every department's Google Calendar, with user/department/type filters, pinned
  view tabs, and a fullscreen wall-display mode.
- **Events** — staged wizard (type → time → location → invitees → remarks → review)
  writing one copy per involved department calendar, with cross-department copy
  reconciliation, duplicate/edit/delete, location policy per event type, and
  round-tripped edit deep links in the Google event notes.
- **Pinned events** — an agenda of explicitly-pinned upcoming events with a live
  count badge, deep-linking into the calendar.
- **Parade state** — today's roll call by (nested) department with an attendance
  mode and a copyable report.
- **KAH constraints** — per-group in-country percentage requirements, a notify-only
  breach check after every event mutation, breach emails (Workspace or SMTP), and a
  read-only KAH Status page for members.
- **Admin surface** — users, department hierarchy + Google ACL sharing, event types,
  title/display-name templates, quick links, announcement banner, audit log with
  retention + CSV export, outbound webhooks with HMAC signatures.
- **PWA** — installable, instant open, offline read-only with saved-view fallback.
- **Mobile-first** — bottom nav and touch layouts on phones; sidebar shell and dense
  tables at the desktop breakpoint.

## 1.2 Tech stack

Next.js 16 (App Router, Turbopack) + TypeScript · Mantine v9 · Neon Postgres +
Drizzle ORM · NextAuth v4 (Credentials, JWT sessions) · Serwist PWA · Vitest ·
Vercel hosting (`main` → production, `dev` → preview) · Google service account
(Calendar v3 + Gmail v1, no-op stub when unconfigured).

## 1.3 Quick start

```bash
pnpm install
cp .env.example .env.local   # fill in DATABASE_URL, NEXTAUTH_SECRET, ADMIN_INITIAL_PASSWORD
pnpm db:migrate              # needs DATABASE_URL in the shell — see the developer guide §1.11
pnpm dev                     # sign in with the admin password
```

Full setup, environment, CI, deployment, and migration workflows:
[`docs/developer-guide.md`](docs/developer-guide.md).

## 1.4 Documentation

| Document | For | Covers |
| -------- | --- | ------ |
| [`docs/user-guide.md`](docs/user-guide.md) | End users | Signing in, calendar views, events, pinned events, parade state, contacts, KAH status, PWA/offline |
| [`docs/admin-guide.md`](docs/admin-guide.md) | Admins | Acting on behalf, every Settings tab, sharing, KAH, audit log |
| [`docs/developer-guide.md`](docs/developer-guide.md) | Developers | Setup, scripts, env, CI, git workflow, Vercel, Google setup, migrations — and the full index of design deep-dives |
| [`AGENTS.md`](AGENTS.md) | AI agents / contributors | Hard rules + entry points for every subsystem |
| [`progress.md`](progress.md) | Everyone | Current status, locked-in decisions, phase changelog, open items |

Design deep-dives for each subsystem live under [`docs/`](docs/) — the complete
annotated index is [`developer-guide.md` §1.12](docs/developer-guide.md#112-related-docs).
