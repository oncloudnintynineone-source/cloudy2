# 1. Cloudy2 — Progress

Internal tool for managing company personnel, leave/event records, and Key Appointment
Holder (KAH) constraints, with Google Calendar as the event/visibility layer.

> This file tracks **current state only**. Detailed per-phase write-ups live in
> [progress-archive.md](progress-archive.md) (section numbers preserved verbatim).
> When you complete a phase: append a one-line entry to §1.3, move/refresh anything
> stateful below, and put the full notes in the archive.

## Table of contents

- [1.1 Status](#11-status)
- [1.2 Decisions locked in (Phase 0)](#12-decisions-locked-in-phase-0)
- [1.3 Phase changelog](#13-phase-changelog)
- [1.4 Open items & next steps](#14-open-items--next-steps)
- [1.5 Deployment & environments](#15-deployment-environments)

## 1.1 Status

- All phases through **Phase 3b0 (Cross-department event invites for non-admins)** are shipped.
- Quality gates (`lint` / `typecheck` / `test` / schema-drift check) run in CI on every
  PR; pushes to `main` additionally auto-apply pending migrations against Neon. The
  per-phase "pnpm … pass" claims are therefore no longer repeated here.
- Feature surface: admin-password + `[phone][keyword]` logins; departments as Google
  Calendars with service-account ACL sharing; audit logging; event CRUD across department
  calendars with cross-department copies, invitees, templates, time options and location
  policy, with outbound webhooks to any number of admin-registered external endpoints on
  create/update/delete; dashboard Month/Mobile-month/Schedule-Day/Week/Week-v2-matrix/Agenda views over
   a layered calendar cache; parade-state page with local attendance mode; contacts page;
   PWA installability with offline & instant open (SWR document + RSC, precached offline.html);
  mobile-first UI with a desktop layout at `lg`; remembered UI state across relaunch;
   audit-log viewer with retention + CSV export; admin-managed quick-links menu
   launched from a grey 3-dots FAB (mobile) / nav-row button (desktop) on the
   Calendar page; user-facing KAH Status page (read-only, member's own groups,
   live in-country % per selected day).
- Google integration is real for Calendar and Gmail-send once configured (service
  account + domain-wide delegation).

## 1.2 Decisions locked in (Phase 0)

| Topic              | Decision                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Architecture       | Single Next.js 16 (App Router) app — no monorepo                                               |
| UI                 | Mantine v9                                                                                     |
| Database           | Neon Postgres + Drizzle ORM                                                                    |
| Auth               | NextAuth v4, Credentials provider, **JWT sessions**                                            |
| Login UX           | Single input field, auto-detect: admin password vs `[phone][keyword]`                          |
| Google integration | GCP service account (Calendar v3 + Gmail v1); domain-wide delegation                           |
| GCal notes         | JSON block stored on events                                                                    |
| Calendars          | Department-level calendars; `calendars` table is the department registry (kind = `department`) |
| Parade states      | `parade_states` lookup table (code/label/description)                                          |
| Settings           | Single-row `settings` table (admin password hash, keyword, KAH default % + notification emails) |
| User→dept          | One department per user: `users.department_id` → `calendars.id` (nullable, ON DELETE SET NULL) |
| PWA / monorepo     | Deferred / not used                                                                            |

## 1.3 Phase changelog

One line per phase; full write-ups (incl. Mermaid diagrams and verification notes) in
[progress-archive.md](progress-archive.md) under the same section numbers.

- 1.3–1.4 Phase 1 scaffold (tooling, DB schema, auth/routing, Google stub, tests)
- 1.5 Vercel deployment blocker diagnosis + fix
- 1.6 CI migrations job (Phase 1.5)
- 1.7 Bootstrap & schema hardening — settings singleton, committed drizzle/meta (Phase 1.5)
- 1.8 Roster & Departments CRUD (Phase 2a)
- 1.9 Dev seeding `db:seed` (Phase 2b)
- 1.10 Next.js 16 upgrade fixing the post-login crash (Phase 2c)
- 1.11 Departments as Google Calendars + ACL sharing + audit log (Phase 2d)
- 1.12 Mobile-only UI refactor; Roster renamed Users (Phase 2e)
- 1.13 Admin Settings hub + login keyword setting (Phase 2f)
- 1.14 Event Types lookup CRUD (Phase 2g)
- 1.15 Next steps (Phase 2+) — superseded by §1.4 below
- 1.16 Calendar events: real month calendar + event create/edit/delete/view (Phase 2h)
- 1.17 Dashboard mobile month view toggle (Phase 2i)
- 1.18 Agenda modal day swipe (Phase 2j)
- 1.19 Schedule view + event invitees (Phase 2k)
- 1.20 Cross-department event copies with reconcile/cascade (Phase 2l)
- 1.21 User shortname (Phase 2m)
- 1.22 Display name template (Phase 2n)
- 1.23 Event title template (Phase 2o)
- 1.24 Event type acronym + Templates tab (Phase 2p)
- 1.25 Schedule view space optimization (Phase 2q)
- 1.26 Git history snapshot (early commits only)
- 1.27 Event time options + live title preview (Phase 2r)
- 1.28 Calendar user filter (Phase 2s)
- 1.28 Admin events on behalf of another user (Phase 2s) *(duplicate number)*
- 1.29 Admin-id UUID guard fix
- 1.30 Empty event title handling (Phase 2t)
- 1.31 Google Calendar "Edit in app" deep link (Phase 2u)
- 1.32 Compressed opaque notes block (Phase 2v)
- 1.33 Searchable user filter (Phase 2w)
- 1.34 PWA installability (Serwist, network-first) (Phase 3a)
- 1.35 Touch-friendly input heights via theme vars (Phase 3b)
- 1.36 Global bottom nav + Overview page (Phase 3c)
- 1.37 Overview cross-department filter fix (Phase 3d)
- 1.38 Cross-department user options in filter dialogs (Phase 3d)
- 1.39 Overview full-selection row scoping fix (Phase 3d)
- 1.40 Externally created events flagged/pinned (Phase 3e)
- 1.41 Additional access levels (Phase 3f)
- 1.42 Calendar caching layer (`google_event_cache`) (Phase 3g)
- 1.43 Calendar force-refresh button (Phase 3h)
- 1.44 Schedule week view; S. Month removed (Phase 3i)
- 1.45 Pinned Week-view day label (Phase 3j)
- 1.46 Out of Camp + location + per-type location policy (Phase 3k)
- 1.47 Staged event form wizard (Phase 3l)
- 1.48 Pinned "On behalf of" select for admins (Phase 3l)
- 1.49 Dashboard toolbar kebab overflow menu (Phase 3m)
- 1.50 Icon-only circular FABs (Phase 3n)
- 1.51 Bigger FABs + download icon optical centering (Phase 3o)
- 1.52 Stale-while-navigating dashboard grid (Phase 3p)
- 1.53 Dashboard grid cold-load reveal (Phase 3p)
- 1.54 Day-view date picker via MobileMonthView (Phase 3q)
- 1.55 Parade State filter row scoping; Event Types filter removed (Phase 3r)
- 1.56 No-keyboard dropdowns (Phase 3s)
- 1.57 Audit log viewer + retention + CSV export (Phase 3t)
- 1.58 Dashboard loading: skeleton only, fade-in on swap (Phase 3u)
- 1.59 Standard loading appearance across the app (Phase 3u)
- 1.60 Event form: stop Enter submitting the draft (Phase 3v)
- 1.61 Email change syncs Google Calendar access (bugfix)
- 1.62 Department selects without type-to-filter search
- 1.63 Dashboard Agenda view (Phase 3w)
- 1.64 Agenda day slide-in + create-event button (Phase 3x)
- 1.65 Agenda-tab day swipe + slide (Phase 3y)
- 1.66 Week v2 matrix view (Phase 3z)
- 1.67 Filter quick actions in the 3-dot menus (Phase 3aa)
- 1.68 Event location polarity fix (bugfix)
- 1.69 Remembered UI state across relaunch (Phase 3ab)
- 1.71 User filter narrows the resource rows (bugfix) *(no 1.70)*
- 1.72 Pinned dashboard view tabs (Phase 3ac)
- 1.73 Legible audit log details (Phase 3ad)
- 1.74 Week v2 event chips + dark-mode tab indicator (Phase 3ae)
- 1.75 Tap-to-show tooltips for user shortnames (Phase 3af)
- 1.76 Documentation deep-dives under docs/ (Phase 3ag)
- 1.77 Desktop responsive layout at lg (Phase 3ah)
- 1.78 Desktop layout review fixes (Phase 3ai)
- 1.79 Desktop responsive bugfixes (Phase 3aj)
- 1.80 Wizard review step, relocated "On behalf of", optional creator (Phase 3ak)
- 1.81 Collapsible sidebar rail (Phase 3al)
- 1.82 Settings list pages: full-size desktop create buttons (Phase 3am)
- 1.83 Mobile FAB: portaled Affix + :root offset vars (bugfix)
- 1.84 Full Day / Half Day time-option split (Phase 3an)
- 1.85 Parade State attendance-taking mode (Phase 3ao)
- 1.86 Calendar skeleton consistency pass (bugfix)
- 1.87 Event webhooks to external systems (Phase 3ap)
- 1.88 Multiple webhook endpoints + in-app payload guide (Phase 3aq)
- 1.89 Attendance report: present wins, no event tags (Phase 3ar)
- 1.90 Branded error/404/offline fallbacks (error boundaries + OfflineBanner)
- 1.91 Mobile correctness: viewport-fit safe areas, toast placement, skeleton fidelity
- 1.92 Interaction consistency: Reset confirm, purge/export loading, filter pills, login errors
- 1.93 Accessibility pass: keyboard-activatable rows/cards, aria-pressed toggles, parade legend
- 1.94 Not-found prerender fix (bugfix)
- 1.95 Department event colors configurable from Settings → Departments (Phase 3as)
- 1.96 Event-type event colors; department color becomes the external-event fallback (Phase 3at)
- 1.97 Sticky calendar chrome: tabs+date-nav pinned at all widths, Week strip docks, mobile headers fixed (Phase 3au)
- 1.98 Pinned Day/Week hour rulers; compact date-nav row; z-order fix for columns overlapping pinned bars (Phase 3av)
- 1.99 Owner hidden from invited-attendee lists; People/Invitees labels renamed (Phase 3aw)
- 1.100 Form validation feedback: toast + scroll to first invalid field + validate-on-blur, all forms
- 1.101 Duplicate phone/shortname crashes fixed: drizzle-wrapped error inspection + no raw SQL in toasts
- 1.102 Slow-network responsiveness: optimistic nav + date-nav chrome, `staleTimes.dynamic=120` client-router reuse (Phase 3ax)
- 1.103 Quick links: admin-managed link menu launched from an amber `IconLink` Calendar FAB (mobile) / labelled "Quick links" nav-row chip (lg), page-scale menu items + kebab-style pop (Phase 3ay)
- 1.104 Fullscreen calendar view: date-nav toggle hides header/nav/sidebar + Fullscreen API, FABs drop to safe-area offset (Phase 3az)
- 1.105 Event invitee picker: non-admins can invite any user and tag any department (Phase 3b0)
- 1.106 Start & End rework: date pickers + 24h TimePicker tap-select dropdowns (15-min step), times set without a keyboard
- 1.106 UserSelectModal: badge picker dialog (search + department grouping) replaces the user multi-selects in the event wizard and FilterModal (Phase 3b1)
- 1.107 UserSelectModal: fixed-height picker dialog — search/footer pinned, only badge sections scroll (bugfix)
- 1.108 UserSelectModal: badge taps keep the search-box focus / soft keyboard open (bugfix)
- 1.109 Announcement banner: admin-managed persistent banner above the header (enable/disable, text, curated color) with a dedicated Settings tab (Phase 3b2)
- 1.110 Announcement banner: admin height presets (Short/Medium/Tall/XL), text wraps + clips, offset via inline `--app-banner-height` (Phase 3b3)
- 1.111 Month view hides adjacent-month days (`withOutsideDays={false}`); skeleton row count matches the unpadded grid (bugfix)
- 1.112 Month view range-reads its 6-week grid (2-3 months via `monthGridMonths`); adjacent-month days show their events, cross-month bars span them (supersedes 1.111; includes a `monthsInRange` UTC-midnight fix)
- 1.113 Mobile FAB clearance: `.fab-page-pad` reserves bottom scroll clearance so last rows/card rows scroll above the portaled FABs instead of underneath them (dashboard, parade-state, contacts) (bugfix)
- 1.114 Day/Week timeline views auto-anchor to the current time on mount when the shown day/week contains today (Day: `startScrollTime={now}`, Week: `startScrollDateTime={today} {now}`), falling back to 07:00 / Monday 07:00 otherwise
- 1.115 Parade state always opens on today: the day leaves the remembered-UI cookie (`parade {cal,users}` filters only); explicit `?date=` still wins
- 1.116 KAH constraints: KAH Groups tab (per-group required in-country %, badge-dialog members), General-tab breach notification emails, notify-only breach check on event create/update via the events cache with one combined Gmail (real `sendEmail` wired; Phase 3b2-adjacent)
- 1.117 KAH email delivery: admin-editable subject/body templates with live preview (General tab), SMTP fallback via `SMTP_URL`/nodemailer for non-Workspace deployments, transport selection delegation → SMTP → audit-only
- 1.118 Departments detail modal: row/card tap opens one modal (settings + calendar access + delete) replacing the Share/Edit/Delete buttons; calendar ID off the list; assigned users get an inline role selector (reader/writer/owner override, immediate + reconcile-safe)
- 1.119 Event wizard modal: outside click / Escape minimize instead of discarding (draft keeps in the floating bubble); "Tap outside to minimize" caption floats beneath the dialog
- 1.120 Desktop wide-grid horizontal pan: mouse drag-to-pan + viewport-edge pan chevrons on the Day/Week/Week v2 grids (`useGridPan` over Mantine `useScroller` + `GridPanControls`) — Mantine hides the native scrollbar and its 4px bar sits at the bottom of a table taller than the page, so a wheel mouse had no discoverable horizontal pan (supersedes the committed fade-edge/always-scrollbar attempt)
- 1.121 PWA offline & instant open: stale-while-revalidate document + RSC caches (`app-documents-swr` / `app-rsc-swr`) so the installed app shows the last-saved calendar instantly — even offline — with background revalidation, a precached branded `offline.html`, per-pathname invalidation on every `router.refresh()` (so mutations never render stale), session-expiry purge + `Saved · HH:MM` chip, and sign-out cache clear (pure predicate module `src/lib/pwa/swRules.ts` unit-tested; `docs/pwa-offline.md`)
- 1.122 KAH Status page: read-only user-facing `/kah-status` showing a member's own group(s) live in-country % for a selected day (default today) via the existing month cache — green/amber/red status badges (amber within 10pts below), away members inline, no-keyboard day selector; nav entry only for users in ≥1 KAH group (server-computed `hasKahGroup`); shared KAH reads extracted to `src/lib/kah/status.ts` (pure `kahStatusForWindow` unit-tested)
- 1.122 Pin/Unpin tab invalidates the current pathname's SWR document + RSC caches: a pre-pin payload could no longer resurrect the old tab order on reload/tab switch and clobber the fresh pin in the `cloudy2.ui` cookie (bugfix for the 1.121 caches)
- 1.123 SW build-update takeover: page caches are now build-versioned (FNV-1a fingerprint of the precache manifest), the new SW wipes older builds' page caches on activate, and the client detects the build swap via `controllerchange` (ServiceWorker object identity) + `clearAllSavedPages()` + reload — a deployed build no longer leaves installed PWA tabs serving older pages/app versions (bugfix for the 1.121 caches)
- 1.124 Offline fallback: query-less navigations (icon tap, bare F5) serve the most recently saved view (stamped, re-stored under the requested URL) and `offline.html` becomes a saved-views picker (newest-first tappable list over the document caches) — the offline page no longer appears while saved views exist (Phase 3b4)
- 1.125 Offline fallback reachability fix: the branded `offline.html` (and its picker) was precached but never served — `caches.match("/offline.html")` misses Serwist's revisioned `?__WB_REVISION__=` cache key, so the fallback always dropped to a bare "You're offline" string; `handlerDidError` now resolves the precache key via `serwist.matchPrecache`, and the absolute-last-resort inline page is a self-contained branded copy of the picker (`OFFLINE_FALLBACK_HTML`) instead of an error string (bugfix for the 1.124 fallback; `docs/pwa-offline.md` §1.9)
- 1.126 Offline UX: any offline navigation (query-less or a never-visited deep link) serves the most recently saved view — the served page already carries the OfflineBanner + "Saved · HH:MM" stamp — and `offline.html` drops the saved-views picker for a plain branded explainer (it only ever shows when the document cache is empty, so the list was dead UI) (Phase 3b4)
- 1.127 Location categories: per-type allowed-locations matrix replaces the in/out/both location policy — events pick one category (In camp / Out of camp / Overseas) via a single selector, the Overseas category carries the new notes `overseas` flag, per-type `show_remarks` toggle drops the Remarks step, and event-type form/table/audit/webhook payloads all carry the new fields (migrations 0027 backfill + 0028 drop the old column) (Phase 3b5)
- 1.128 KAH in-country fix: a member counts as "away" only when tagged on an Overseas event (`eventTakesMembersOverseas`), so in-camp and local out-of-camp events keep them in-country and legacy events without the flag never count (bugfix for the previous "any tagged event counts" rule)
- 1.129 Per-type Invited Attendees toggle (`event_types.show_invitees`): the wizard's invitees step drops for hidden types, `resolveEventFields` clears attendees (creator always stays invited), and target calendars derive from the cleared input so editing a hidden-type event collapses its copies to the creator's department (migration 0029; mirrors the 1.127 `show_remarks` pattern)
- 1.130 In-camp events may record an optional specific location: the wizard's location input is always enabled (never disabled for In camp), the location step always shows (an exclusively in-camp type just collapses the category selector), switching back to In camp keeps the typed location, and `clampOutOfCamp` preserves the location string in every category — the KAH "away" signal remains purely the Overseas flag
- 1.131 Department hierarchy: `calendars.parent_id` self FK (migration 0030) — departments nest under parent departments (any depth) while users stay in one direct department; Settings → Departments gains a Parent select (self/descendants excluded, server-side cycle check), a tree list (indent + Parent column / "In {parent}" line) and sibling-scoped up/down moves; deleting a parent promotes its children to top level (confirm warns); parade state renders nested sections whose `NAME (present/total)` headers aggregate down the subtree (direct + all sub-departments), and the attendance clipboard report emits flat blocks in tree order with the same aggregated counts (pure `src/lib/roster/hierarchy.ts` + tree-aware `departmentTreeHeadcount`/`buildAttendanceReport`, all unit-tested; `docs/roster-sharing.md` §1.7)

## 1.4 Open items & next steps

1. **ADMIN_INITIAL_PASSWORD** must be set on Vercel (seeds the admin password hash on
   first login) — the only unfinished item from the original deployment checklist.
2. **Breach email transport**: configure either Workspace domain-wide delegation
   (`gmail.send` scope for `GOOGLE_DELEGATE_EMAIL`) or the SMTP fallback (`SMTP_URL`,
   e.g. a personal Gmail app password) — without one, breaches stay audit-only.
3. Carried-over Phase-0 scope to re-confirm as still wanted: acronym glossary surfaced
   on event titles, VCF contacts export, masquerade permissions beyond "on behalf of".
4. Per-phase manual-QA debts recorded in the archive's verification notes (PWA device
   installs, on-device swipe checks, width sweeps) were never systematically cleared.

## 1.5 Deployment & environments

- Vercel auto-builds: `main` → production, `dev` → preview. Pending migrations
  auto-apply on `main` push via the CI migrate job against the shared Neon DB.
- Env vars: `DATABASE_URL`, `NEXTAUTH_SECRET`, `ADMIN_INITIAL_PASSWORD`, plus Google
  service-account vars. Leave `NEXTAUTH_URL` unset; set
  `ENABLE_EXPERIMENTAL_COREPACK = 1`. Canonical gotchas live in AGENTS.md.
