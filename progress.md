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
- [1.5 Deployment & environments](#15-deployment--environments)

## 1.1 Status

- All work through changelog **1.282 (frosted button shadows)** is shipped.
- Quality gates (`lint` / `typecheck` / `test` / schema-drift check) run in CI on every
  push and PR. Pushes also auto-apply migrations per environment: `dev` →
  `migrate-preview` against the dev Neon DB, `main` → `migrate` against the prod Neon
  DB then `deploy-cloudrun` (Cloud Run shadow). The per-phase "pnpm … pass" claims are
  therefore no longer repeated here.
- Feature surface: single-field login (`[phone][keyword]`, admin PIN modal, phone-less
  env root); departments as Google
  Calendars with service-account ACL sharing; audit logging; event CRUD across department
  calendars with cross-department copies, invitees, templates, time options and location
  policy, with outbound webhooks to any number of admin-registered external endpoints on
  create/update/delete and pre-submit event clash warnings on the wizard's review step;
  a Double Booking page that scans an existing schedule for double-bookings over the next
   30 days, surfaced by a live count pill on its nav entry; an on-demand set of user-created
     dashboard **Views (tabs)** over the six renderer kinds (Month / Week (H) / Week (D) / Day /
     Agenda / Month & Agenda; each tab has its own name, order and Cal/Users/Types filters, stored server-side) over
   a layered calendar cache; parade-state page with local attendance mode; contacts page;
  PWA installability with offline & instant open (SWR document + RSC, precached offline.html);
  mobile-first UI with a desktop layout at `lg`; remembered UI state across relaunch;
  audit-log viewer with retention + CSV export; admin-managed quick-links menu
  launched from an amber `IconLink` FAB (mobile) / nav-row chip (desktop) on the
  Calendar page; user-facing KAH Status page (read-only breach history &
  forecast over a ±3-month window: resolved/active/upcoming breach periods,
  member's own groups; admins: all); Web Push notifications to users newly added
  as participants to an event (create/update only, per-device permission + an
  account-wide pause switch in Profile → Notifications).
- Google integration is real for Calendar and Gmail-send once configured (service
  account + domain-wide delegation).

## 1.2 Decisions locked in (Phase 0)

| Topic              | Decision                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Architecture       | Single Next.js 16 (App Router) app — no monorepo                                                                 |
| UI                 | Mantine v9                                                                                                       |
| Database           | Neon Postgres + Drizzle ORM                                                                                      |
| Auth               | NextAuth v4, Credentials provider, **JWT sessions**                                                              |
| Login UX           | Single clean field: `[phone][keyword]`; admin-role users get a shared-PIN modal; phone-less env root             |
| Google integration | GCP service account (Calendar v3 + Gmail v1); domain-wide delegation                                             |
| GCal notes         | JSON block stored on events                                                                                      |
| Calendars          | Department-level calendars; `calendars` table is the department registry (kind = `department`)                   |
| Parade states      | `parade_states` lookup table (code/label/description)                                                            |
| Settings           | Single-row `settings` table (admin password hash + admin PIN hash, keyword, KAH default % + notification emails) |
| User→dept          | One department per user: `users.department_id` → `calendars.id` (nullable, ON DELETE SET NULL)                   |
| PWA / monorepo     | Deferred / not used                                                                                              |

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
- 1.28 Admin events on behalf of another user (Phase 2s) _(duplicate number)_
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
- 1.71 User filter narrows the resource rows (bugfix) _(no 1.70)_
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
- 1.132 Pinned Events (department agenda): a header pin button beside the light/dark toggle (all pages) opens a centered Modal listing every department-pinned event (`inviteeDepartmentIds` non-empty) over a rolling today→3-months window, ignoring dashboard filters — server fetch through the events cache (`fetchPinnedEvents`), pure `selectUpcomingPinnedEvents` (drops ended, sorts by start), tap jumps to `/dashboard?date=…`, non-dashboard taps navigate to the dashboard first (Phase 3b6)
- 1.133 Pinned Events tap-to-open: the header pin becomes a labelled `brand.8` pill ("Pinned events"), and tapping an agenda event deep-links `/dashboard?date=…&event=<groupId>` where the dashboard auto-opens the event details modal (Edit/Duplicate/Delete per the usual `isAdmin || creator` rule) — mirrors the `?edit=` deep link (cookie-skipped defaults read, one-shot param strip, "Could not open that event" fallback banner); legacy events without a group id fall back to the date alone (Phase 3b6)
- 1.134 Pinned Events count badge: the header pill gains an amber `Indicator` dot showing how many department-pinned events are upcoming (`countPinnedEvents`, the panel's shared read without title resolution) — refreshed on mount, on panel close, on tab refocus, and after every event create/update/delete via the `cloudy2:pinned-events-changed` window event dispatched at the dashboard's `onDeleted` / form `onDone` (Phase 3b6)
- 1.135 Pinned Events grow/shrink transition: the panel modal zooms out of / shrinks back into the header pin button via the app's standard `motion/origin` animation (`originRect` captured at tap and carried through `PinnedPanelContext`; `transitionProps` mirrored from `EventDetail`) (Phase 3b6)
- 1.136 Pinned event title template target: `pinned` joins the 5 dashboard views as an assignable template target (`EVENT_TITLE_ASSIGNMENT_TARGETS` in `src/lib/settings/validate.ts`, stored in the existing `eventTitleTemplateAssignments` jsonb — no migration) — the Pinned Events panel titles render through the pinned assignment (fallback master) via `fetchPinnedEvents`, and the View assignments modal gains a "Pinned events" row using the same library-template Select as the views; `normalizeAssignments`/`validateAssignments` whitelist the new key, and the delete-blocked message labels targets
- 1.137 Pinned Events become an explicit event flag: a "Pin this event" switch on the wizard's Invited Attendees step (any user) sets the new notes `pinned` flag (`parseEventPinned`), and `selectUpcomingPinnedEvents` now keeps only explicitly-pinned events — tagging a whole department no longer pins by itself, so existing department-tagged events drop out of the panel until re-pinned; the flag rides the existing notes block (no migration), round-trips edit/duplicate, and joins the audit snapshot + webhook payloads so pin/unpin shows as a diff (Phase 3b6)
- 1.138 Day/Week (H) timeline zoom: floating zoom-in/out buttons scale the hour-column width (levels 0.5–2 in 25% steps, default 1 = today's widths) by writing the zoomed value to the views' `--resources-*-view-slot-width` CSS var (Mantine re-lays out slots + percentage-based events with no JS geometry work); one shared level, remembered per device in `cloudy2.ui` as `dashboard.zoom` (not URL-backed — zooming never navigates, read from the raw cookie, seeded before first paint); the pinned hour ruler + Week (H) day-label strip re-measure on change (`zoom` in the layout-effect deps); pure `src/lib/ui/slotZoom.ts` (levels/clamp/width math) unit-tested; `docs/dashboard-views.md` §1.5 + `ui-state.md`/`grid-pan.md`/`desktop-responsive.md` updates (Phase 3b7)
- 1.139 Audit log multi-value filters: Actors/Actions/Entity types become multi-selects through the shared `FilterModal` + `UserSelectModal` badge picker (Actors grouped by roster department, "Other" for Admin/deleted users), applied selections show as removable pills (parade-state pattern), URL params `actor`/`action`/`entity` are now comma-joined lists (`multi()` parser, `inArray` conditions, single-value URLs still parse) and flow through load-more and CSV export unchanged (Phase 3b7)
- 1.140 Dev environment isolation: `dev` → preview now runs on a dedicated dev Neon project + dev Google service account (separate accounts from prod); Vercel env vars split per environment, CI `migrate-preview` job on `dev` pushes, docs updated
- 1.141 Bootstrap-admin KAH crash fix: admin-password sessions carry the synthetic id "admin" (no user row), so the protected layout's `userHasKahGroup` / kah-status page's `kahGroupsForUser` sent it against the uuid column `kah_group_members.user_id` and Postgres rejected the cast (22P02) — a 500 on every admin login since the KAH integration; both queries now guard with pure `isUuid` (unit-tested) and treat non-UUID ids as "no KAH groups" (bugfix)
- 1.142 KAH Status for admins: the nav entry no longer requires membership for admins (`AppShellShell` always includes it, and the protected layout skips the membership lookup for them), and the page lists every KAH group via `listKahGroupChecks` with a dimmed "Admin view" hint and an adjusted empty state — member behavior unchanged
- 1.143 Wide-grid pan/zoom buttons are now `position: fixed` and **statically anchored** — the grid's visible-slice center + edge insets are measured once on view load (re-measured only on window resize / anchor size change), with **no scroll listener at all**, so the buttons hold perfectly still at the calendar's visible-area center and never leave the screen. Earlier attempts rejected: React state per scroll event (updates landed a frame late → wobble), a pure-CSS sticky rail (clamped to the grid's own box → rode out of view near its edges), and rAF-synced direct-DOM tracking (moved with the calendar on grids shorter than the viewport, stuttering when scroll frames coalesced) (bugfix; `docs/grid-pan.md` §1.2)
- 1.144 Highlight my entries across all dashboard views: "mine" = created-by or tagged-on (the Myself filter's semantics, `eventMatchesUserFilter`) — Day/Week (H)/Week (D): the user's whole row tints amber via a `data-c2-my-row` label marker + structural CSS `:has()` rules targeting exactly the label cell + row (Week (D) adds a uniform day-cell tint via `myRowId`); Month: events pre-sorted by pure unit-tested `sortMineFirst` so my entries claim the top rows of each day + amber chip ring via `renderEvent` (incl. "+N more" popup); Agenda tab + day modal: amber bar/tint + semibold title via `renderEvent`, chronological order kept; unconditional, amber `accent` palette, roster members only for rows (Phase 3b8; `docs/dashboard-views.md` §1.5)
- 1.145 Dark-mode my-entry tint fix: the 1.144 row/label/agenda tint used the near-white accent-0/1 creams, which glow on the dark body — the tints now switch on color scheme via `--c2-my-row-tint` / `--c2-my-label-tint` custom properties (dark: row `#3d3200` / label `#4a3c00`, matching Parade State's dark amber card), consumed by the `globals.css` rules and read inline by the Week (D) matrix, whose scheme-blind `myTint` prop chain was dropped; accent-6 bars/dot/ring unchanged (dark-mode fix; `docs/dashboard-views.md` §1.5)
- 1.146 KAH Status becomes breach history & forecast: the selected-day view (day nav + per-group day table) is replaced by a month-aligned ±3-month scan that lists each group's consecutive breach periods once each — date span, day count, lowest in-country %, union of away members, edge-clipped runs — each marked Resolved (ended before today) / Active (includes today) / Upcoming (starts after today), plus an "All clear" list for breach-free groups; one `overseasEventsInRange` month-cache read feeds pure `busyDaysInRange` + per-day `kahStatusForWindow` + `kahBreachEpisodes` (all unit-tested), `busyKahsIn` is now a thin wrapper over the same read so the notify path and the status page never diverge, and the `?date=` param is gone (Phase 3b8; `docs/kah.md` §1.7)
- 1.147 Accessibility quick wins: a keyboard skip-to-content link (first focusable element, targets `#main-content` on `AppShell.Main`); one polite live region (`StatusAnnouncer` + `announce()`, mounted in the shell) fed by the dashboard's view/period changes, filter apply/clear counts and zoom level; `LoadingStatus` sr-only `role="status"` announcements on all 14 route skeletons and the client-side skeleton swaps (dashboard/parade-state/audit-log/pinned-events); filter buttons and the pinned-events badge now carry the count in the accessible name with the visual badge `aria-hidden` (`docs/accessibility.md`)
- 1.148 Actionable empty states: shared `EmptyState` component (muted icon + message + one action) replaces the bare dimmed `Text` across the app — settings tables get their "Add …" action (users/event-types/quick-links/webhooks/KAH groups/departments), the audit log and dashboard get "Clear filters", contacts/parade-state/KAH status link into the relevant Settings tab for admins (non-admins keep the plain message), and filter-driven empty states (users/contacts) offer "Clear search & filters" (Phase 3b9)
- 1.149 Sticky Month weekday-initials row: `MonthView` passes `withWeekDays={false}` (its built-in row scrolls away inside the content-height ScrollArea) and a new pinned `MonthWeekdayStrip` sits beneath the chrome like the Week (H) day-label strip; the strip's 7-column track mirrors the grid's 5.25rem minimum column width and translates by `-scrollLeft` via `monthScrollAreaProps`, so the initials stay over their columns on the narrow screens where the ≥588px grid scrolls horizontally (Phase 3b9)
- 1.150 Timeline zoom re-anchoring: zooming the Day/Week (H) grids now keeps the time at the viewport's center centered instead of leaving `scrollLeft` in px — a `useLayoutEffect` (declared before the ruler measurement effect) derives the old slot width from the new width × zoom ratio and re-anchors via the pure, unit-tested `reanchorScrollLeft` (which subtracts the zoom-invariant label column before scaling) (`docs/dashboard-views.md` §1.6)
- 1.151 Cold-open splash fix: the protected layout no longer awaits the announcement-banner / KAH-group DB reads before rendering the AppShell — both stream via Suspense (`ShellBanner` / `ShellKahNav` + the `ShellChromeContext` in `src/components/ShellChrome.tsx`), so a Neon scale-to-zero cold start can't hold up first paint (the Android PWA splash no longer sits 10s+ on cache-miss opens; the shell + route skeleton paint immediately and the banner/KAH nav stream in). The banner slot reserves its 25px while pending (`BannerPlaceholder`) and collapses when the read resolves null; manifest splash `background_color` → brand navy (`docs/announcement-banner.md` §1.1/§1.3)
- 1.152 Android PWA splash, take two — 1.151 streamed the layout correctly but missed the bottleneck: first byte was blocked by **module load**, not the DB. `getGoogleIntegration()` now loads `./real` through a dynamic `import()`, moving the ~200 MB `googleapis` package (~1.4s to `require`) out of `/dashboard`'s eager chunk graph (A/B-verified on a Turbopack build: a 12.3 MB chunk, `EAGER-FOR-DASHBOARD` True → False). The SW now answers the start URL `/` from the **precache unconditionally** — `public/loading.html` paints the branded shell (Chrome lifts the splash on first non-empty paint), then resolves the remembered page from the client-owned `cloudy2.ui` cookie and redirects behind a double `requestAnimationFrame`, so a launch costs no server round trip for `/` at all. Replaces the saved-view/threshold launch rule, which was inert after every deploy (page caches are wiped on activate) and ended on stale data after three round trips (`docs/pwa-offline.md` §1.5.1, `docs/google-integration.md` §1.6)
- 1.153 Document navigations are now routed by cache age instead of always stale-while-revalidate: a metadata-only peek at the stored entry's `Date` feeds pure `isDocumentFresh` — under `DOCUMENT_FRESH_WINDOW_MS` (5 min) → `StaleWhileRevalidate` (instant + background revalidate), otherwise → `NetworkFirst` (fresh content; cache fallback only when the network _fails_, so offline is unchanged, and `handlerDidError` still reaches the offline fallback). No `networkTimeoutSeconds` on purpose — on a cold function + Neon the fresh response outlives any sane timeout, so one would hand back stale data in exactly the case the rule exists for. Both strategies share one plugins array (ExpirationPlugin keys its CacheExpiration by cacheName, so a second instance would double-manage the cache). Completes the launch story: shell paints → redirect → fresh content behind the still-painted skeleton, no stale flash (`docs/pwa-offline.md` §1.5)
- 1.154 Reversed the §1.151 banner-reservation decision: the shell **no longer reserves** the announcement-banner's 25px while its streamed read is pending (`AppShellShell.bannerActive` defaults `false`; `BannerPlaceholder` renders nothing). The header is the bare 56px bar from first paint, so a cold start is launch-shell 56px → app skeleton 56px → no jump when the banner resolves null (previously a double 56→81→56 shift). Trade-off, deliberately chosen: a _configured_ banner now shifts the header downward when it resolves present, on cold and warm loads alike (`docs/announcement-banner.md` §1.3.1)
- 1.155 Single-skeleton launch: the double-skeleton reported on PWA launches (§1.152's dark generic launch shell → §1.153's network-first handoff → streamed `loading.tsx` skeleton → data) is fixed two ways — `public/loading.html` now **pixel-matches the app's route skeleton** (all five view variants selected from the remembered `dashboard.view`, Mantine v9 exact palette + pulse for light/dark/auto incl. the `mantine-color-scheme-value` override, brand-bar header + bottom-nav placeholders; cell geometry mirrors `calendarSkeleton.tsx`), so the shell→`loading.tsx` handoff reads as one continuous skeleton; and `handleLaunchRequest` gained a **fresh-document shortcut** — `launchTargetFromCookieHeader` (pure, in `swRules`) resolves the remembered page from the request's `Cookie` header and a still-fresh (≤5 min) cached doc for it 302s straight to the target, so warm launches paint the full grid with **no skeleton at all** (`docs/pwa-offline.md` §1.5.1, `docs/loading-transitions.md` §1.4)
- 1.156 Per-view dashboard filters + one-button filter UI: the ⋮ kebab loses its Filters section (Today/Select date/Pin tab/Force refresh only) and a dedicated `FilterButton` (icon + active-count badge) opens the filter modal, which keeps Calendars + Users prominent and tucks Event Types behind a Show/Hide disclosure; a "Filter scope" control in the modal footer switches between **Same for all views** (default) and **Different per view** — per-view mode remembers each of Month/Week H/Week D/Day/Agenda its own Cal/Users/Types set in `dashboard.filterMode` + `dashboard.views` (explicit empty lists kept as "cleared"), resolved by the pure `resolveDashboardFilters` (URL → per-view → shared → role default; `_fresh` skips only the current view; `filterMode`/other views read from the raw cookie like pins), `switchView` writes the target view's filters into the URL in per-view mode, and stale ids are validated in the page before resolution (Phase 3b10; `docs/ui-state.md` §1.5.1, `docs/dashboard-views.md` §1.2)
- 1.157 Reset/Clear reverted by the stale `_fresh` strip: the filter dialog's Reset (and parade Clear) "did nothing" in per-view mode because the self-terminating `_fresh` strip was a plain `router.push` back to the bare URL — the client-router/SW RSC cache (`staleTimes.dynamic: 120`) replayed the pre-clear snapshot, reverting the cleared filters and letting `usePersistUiState` re-seed the just-cleared memory. Both `_fresh` strips now mirror the `?refresh=` strip (`router.replace + router.refresh()`), re-serving the bare URL from the server (bugfix; `docs/ui-state.md` §1.9, `docs/loading-transitions.md` §1.7)
- 1.158 Per-view filters silently wiped by the overflow drain; cookie versioning: with 15+ calendars the per-view writer persisted the FULL resolved `views` map (cal=all × five views), crossing `SAFE_COOKIE_VALUE_LENGTH` so the overflow guard permanently dropped the whole `views` map — Users (the only visibly-affected filter) "reset" across switches and survived nothing, not even a reload. Fix: `buildDashboardPersist` now persists only views the user configured/cleared (merged with the previous map — untouched views keep absent keys), `reduceUiStateForCookie` trims least-intentful lists instead of nuking the map, and the cookie carries `v: [major, minor]` — `decodeUiState` drops the cookie on any major mismatch; this ship is the v2 major bump (clean slate), with a `MINOR_MIGRATIONS` chain for future minor fixes (bugfix; `docs/ui-state.md` §1.4/§1.5.1/§1.7, `docs/dashboard-views.md` §1.2)
- 1.159 Per-view filters leaked into untouched views: per-view resolution still fell back to the SHARED set, and the shared set was overwritten with the current view's selection on every render — so a view you never configured inherited the last configured view's filters (and `switchView` even copied them into its URL). Fix: per-view mode ignores the shared set entirely — `resolveDashboardFilters` gained `perView`, resolving `URL → views[view] → role default` for every key; untouched views show role defaults and configuring one view can't leak into another. The shared set stays the global-mode set and the flip-back-to-Same-for-all-views target (bugfix; `docs/ui-state.md` §1.5.1, `docs/dashboard-views.md` §1.2)
- 1.160 External-event highlight across all dashboard views: Google-created events (`payload.external` at read time) get a **purple** treatment in parallel with the amber "mine" one — Month: purple chip ring via `c2-ext-event` (incl. "+N more"); Agenda tab + day modal: purple bar/tint/bold via `c2-ext-agenda-event`; Day / Week (H): purple block ring via `c2-ext-slot-event` on the root (one `> *` outline rule covers timed events, Week (H) all-day bars and Day's custom all-day Box); Week (D): self ring `c2-ext-ring` on the banner box; dark scheme via `--c2-ext-row-tint`; purely additive — event body colors, "mine" treatment and KAH/audit behavior untouched (`docs/dashboard-views.md` §1.6)
- 1.161 Event search: a header search icon (between Pinned events and the theme toggle) opens a lazy-loaded (`dynamic` + `ssr:false`, `searchLoaded` keeps it mounted after first open) modal that free-text searches every department calendar **directly via Google** (`GoogleIntegration.searchEvents` → `events.list` with `q`, bypassing the month cache) over a default one-month-back → three-months-ahead window (user-pickable, span-clamped); results are mapped through the shared `mapCalendarItem` (now exported) and deduped by logical event, rendered in `@mantine/schedule`'s `AgendaView`, and the modal zooms out of / shrinks into the search button (`motion/origin`); tapping a result shows a spinner on that row (`useTransition` `isPending`) and deep-links `/dashboard?date=…&event=…` to the shared full `EventDetail` (Duplicate/Edit/Delete), closing once the navigation commits — no read-only intermediate; `q` matches `summary`/`location`/`description` but not the compressed notes, so type/people only hit when the title template renders them; pure `src/lib/events/searchRange.ts` (defaults, exclusive-end boundaries, span clamp) unit-tested, `mapCalendarItem` export + stub `searchEvents`; `docs/event-search.md`, `developer-guide`/`AGENTS.md` links (Phase 3b11)
- 1.162 Search deep-link opens reliably regardless of filters: clicking a result now also passes `&_eventCal=<calendar id>` so `page.tsx` includes that calendar in the fetch set only (never the filter selection / remembered state — the cookie is skipped on `?event=` deep links, and role-default filters could otherwise exclude the event → "Could not open that event"); the one-shot `event`/`_eventCal` strip re-arms on clear and `DashboardView` re-arms its `prevDetailLinkId` same-id guard, so clicking the same event again re-opens it (previously a dead no-op after the first open); the search modal resets query/results on close so a reopened modal is fresh (bugfix; `docs/event-search.md` §1.9)
- 1.163 Compact tier for very small form-factor phones (≤ 360px): a shared `NARROW_MEDIA_QUERY` + `useMediaQuery` `isNarrow` flag tightens the fixed-width chrome that overflows at that width — the header "Pinned events" button becomes an icon-only `ActionIcon` (count badge still rides the `aria-label`), header gutters/brand shrink and the bottom nav drops its text labels to icons only (`NavButton` `compact`), and the shared modals step down one size (event form/detail/agenda/filter/date picker `sm`→`xs`; search/pinned `md`→`sm`) with the `motion/origin` shrink widths kept in sync per tier; deliberately a JS-only query (not a Mantine breakpoint) so it can't collide with `xs:`/`lg:` min-width props; `docs/desktop-responsive.md` §1.10
- 1.164 Event type groups: admin-defined display categories (`event_type_groups` + nullable `event_types.group_id` FK `ON DELETE SET NULL`, migration 0031) — the wizard's type step renders one labeled section per group in the admin's `sort_order` (types alphabetical, empty groups skipped, ungrouped types in a trailing "Ungrouped" section), groups are managed in Settings → Event Types' "Manage groups" dialog (create / inline rename / delete with ungroup-count confirm / up-down reorder with rank re-gap-closing), and the event type form gains a Group `NoKeyboardSelect` + the type table a Group column/badge; sections come from pure, unit-tested `buildEventTypePickerSections`, group actions audit as `eventTypeGroup.*` — presentation-only, notes/targets/KAH/colors untouched (`docs/event-lifecycle.md` §1.10)
- 1.165 PWA-standalone desktop footer-offset bugfix: the iOS/Android viewport-sync effect measured the collapsed (desktop) bottom nav — still 56px tall, only translated off-screen — and wrote `--app-shell-footer-offset: 56px` **inline on the shell root**, where it beats Mantine's `:root { …: 0px !important }` for every descendant (custom-property cascade is per element); the installed-PWA navbar therefore stopped 56px above the viewport bottom and Main gained 56px of phantom bottom padding that read as huge FAB clearance at desktop widths (surfaced on foldables by the 800px breakpoint). The sync now skips the write (and removes any stale value) while `isDesktop`; browser-mode layouts were never affected (`docs/desktop-responsive.md` §1.2)
- 1.166 Foldable desktop tier: the desktop breakpoint drops 800px → **640px (40em)** so unfolded foldables' inner screens (Galaxy Z Fold ≈653px, Pixel Fold ≈640px) get the shell instead of the mobile single column — `theme.ts` `md`/`lg` + `DESKTOP_MEDIA_QUERY`, `globals.css`'s `@media (min-width: 40em)` block, `postcss.config.cjs`, and `public/loading.html` moved together; a new JS-only `DESKTOP_WIDE_MEDIA_QUERY` (50em) drives one-shot **auto-collapse to the 64px icon rail** when entering the 640–799px band (manual expand inside the band survives until the next entry, ≥800px keeps the remembered cookie state); the 36em card-grid early tier is now vestigial but kept as harmless insurance; note `lg` (40em) sits below `sm` (48em) — prefer `lg:` props, don't mix `sm:`/`md:` in one responsive prop (`docs/desktop-responsive.md` §1.1/§1.2, `AGENTS.md`)
- 1.167 PWA launch regression fixed — the Android splash was back to sitting through the whole cold boot, because the launch burst (§1.152–§1.155) had two defects: the document route's **cache-age rule** (§1.153) sent any copy older than 5 min to `NetworkFirst` (the common case for an app reopened after a coffee break), and §1.155's **fresh-document shortcut** could never fire — it read `request.headers.get("cookie")`, but `Cookie` is a _forbidden request header_ the Fetch standard appends in the network layer **after** service-worker interception, so the one branch that skipped the shell navigated with nothing painted. Now: the launch route answers `/` with the precached shell **unconditionally, never redirecting** (`isStartUrlRequest` also tolerates launcher `utm_*` params, which had been able to drop the launch onto the blocking document route); the document route serves a cached copy at **any age** and revalidates in the background; and staleness is fixed **after** paint by `useStaleDocumentReconcile` (mounted in `AppProviders`) — one non-blocking `router.refresh()` per document load when the SW's stamp is older than `DOCUMENT_FRESH_WINDOW_MS`, clearing **RSC only** via `invalidateRscPathCaches` so the instant-launch document survives (the one exception to the invalidate-before-refresh rule), announcing `cloudy2:document-reconciled` so the "Saved · HH:MM" chip flips to fresh; `launchTargetFromCookieHeader`/`LAUNCH_ROUTE_WHITELIST` deleted (the shell keeps its own client-side decode), and `launchShell.test.ts` gains a static guard that the launch route has no redirect and no cookie peek (bugfix; `docs/pwa-offline.md` §1.4–§1.5.1/§1.7/§1.11–§1.13/§1.15, `docs/ui-state.md`, `AGENTS.md`)
- 1.168 Global activity bar: an indeterminate amber strip pinned flush to the shell header's bottom edge appears whenever anything is loading elsewhere in the chrome — route `<Link>` navigations (shell nav/rail/bottom/logo via `useLinkStatus` in `PendingDim`), the settings tab flips (`startTransition` in `SettingsTabs`), in-page view/filter transitions (dashboard `isPending||isRefreshing`, parade cross-month gate, audit filter `isPending`), and the previously **invisible post-mutation `router.refresh()`** (a new `useActivityRefresh` wraps the SW-cache-invalidate + refresh in a transition so `isPending` tracks the RSC round trip; replaces `invalidateCurrentPathCaches().then(() => router.refresh())` in all 9 settings tables/forms + dashboard + audit). Shared `ActivityProvider`/`useActivity` refcount keys in `src/components/ActivityBar.tsx`; immediate show + min hold (150 ms) so fast loads never blip; hidden in immersive mode (header already hides); complements rather than replaces the skeleton-only system — reverses the old "no progress bars" non-goal in `docs/loading-transitions.md` §1.2 (`docs/loading-transitions.md` §1.13, `AGENTS.md`; Phase 3b12)
- 1.169 Google Calendar note link opens details, not the edit form: the `Edit: <url>` line written into event notes now deep-links `/dashboard?date=…&event=<groupId>&_eventCal=<calendarId>` (the shared details deep link — `eventEditUrl` renamed `eventDetailUrl`, each copy's link carries its own calendar so the fetch includes it even when the arriving user's filters exclude it), landing on the full `EventDetail` modal with Edit/Duplicate/Delete inside instead of dropping straight into the wizard; older notes keep their `&edit=` URLs, which stay fully honored as a legacy deep link (also used by the search modal's "Edit" action), and `event` joins `ONE_SHOT_PARAMS` so the stripped deep-link responses never pollute the document/RSC caches (also closes that pre-existing gap for search/Pinned `?event=` links) (`docs/event-lifecycle.md` §1.4.2/§1.7.3, `docs/loading-transitions.md` §1.7 gains the missing `?event=` row, `docs/pwa-offline.md`, `docs/event-search.md`, `AGENTS.md`)
- 1.170 Pinned-events header ticker: the header's left edge is now the pinned-events pill (`PinnedEventsTicker`) — pin icon kept, "Cloudy2" logo removed — rotating through the upcoming pinned events' titles every 5s with a vertical ticker slide (paused on hover/focus/hidden tab/open panel, reduced-motion swaps in place), an inline amber `1/N` count chip replacing the floating `Indicator`, and a CSS max-width cap so wide headers don't stretch it; the shell now reads `fetchPinnedEvents` (count = list length; the count-only `countPinnedEvents` is deleted), and `fetchPinnedEvents` renders each event twice — panel `title` via the `pinned` target, ticker `tickerTitle` via the new **`pinnedHeader`** template assignment target (`EVENT_TITLE_ASSIGNMENT_TARGETS`, labels "Pinned events (panel)"/"Pinned events (header)", no migration; `docs/pinned-events.md` §1.4, `docs/event-lifecycle.md` §1.8.5)
- 1.171 `db:seed` no longer seeds departments or users: a department (`calendars`) row must mirror a real Google calendar created in-app (`createDepartment` → `integration.createCalendar`), so the seed's fabricated ids (`dept-*@cloudy.local`) broke a configured service account — every Google-backed read (dashboard default fetch, parade/KAH, search, ACL reconcile) 404'd on them. The seed is now a safe, DB-only settings default: it ensures the settings row exists (mirroring `ensureSettingsRow`, hashing `ADMIN_INITIAL_PASSWORD` when set so first admin login still works) and defaults `userKeyword = 'leave'`; departments/users are created in-app on a migrations-only DB. Docs/`AGENTS.md` updated to say departments/users are created in-app only
- 1.172 Remove the "Same for all views" filter mode — dashboard filters are **per view only**: the FilterModal's "Filter scope" SegmentedControl and the whole global/shared-set mode are deleted. `resolveDashboardFilters` drops its `global` fallback and `perView` switch (every view resolves URL → `views[view]` → role default), `buildDashboardPersist` stops writing the legacy shared `cal/users/types` (omitted, so the section-wholesale merge prunes them from pre-removal cookies) and always writes the per-view marker, `normalizeUiState` always keeps `views` (a stale `"global"` `filterMode` is dropped), and `switchView` always writes the target view's filters into the URL. A filter set on one calendar view can no longer leak into another view — an untouched view always
  resolves to the role default — and the dialog's scope hint is now unconditional
  ("These filters apply to {view} only.") (`docs/dashboard-views.md` §1.2,
  `docs/ui-state.md` §1.4/§1.5.1/§1.7/§1.9, `docs/user-guide.md`, `AGENTS.md`)
- 1.173 Cloud Run shadow deployment (dual-hosting): the same commit now also ships to a
  Cloud Run **shadow** (`cloudy2`, `asia-southeast1`) via a `main`-only
  `deploy-cloudrun` job in `ci.yml` (`quality` → `migrate` → Docker build/push to
  Artifact Registry → deploy → env-var revision). The image runs the regular
  `next start` over the full `.next` + `node_modules` — deliberately **not**
  `output: standalone` (pnpm's isolated layout drops packages under standalone
  tracing, e.g. `@swc/helpers`, and pnpm 11 ignores `.npmrc` linker overrides) — so
  `next.config.ts` carries no platform config and Vercel's build is unchanged.
  Lessons fixed live: Docker auth uses `_json_key` + the SA-key JSON (the
  `oauth2accesstoken` pairing needs WIF); `GCP_PROJECT_ID` is a repo **variable**
  (unmasked in logs) not a secret; `--allow-unauthenticated` must ride the gcloud
  `flags` (dropped as an action input); all env vars incl. `NEXTAUTH_URL` land in one
  `--env-vars-file` `gcloud run services update`. Prod = Vercel Production + the
  Cloud Run shadow sharing prod Neon + prod Google (region `asia-southeast1`);
  environments matrix in `docs/developer-guide.md` §1.9/§1.9.1, `AGENTS.md`
- 1.174 Unsupported-browser gate on /login: the stack compiles for Next 16 / React 19's
  Safari 16.4 / Chrome 111 floor, so on older engines (e.g. iPhone SE 1st gen on iOS
  15.8.8) the login page paints but the client bundle throws during hydration — the
  form looked alive but taps did nothing (no spinner, dead mask toggle). Pure
  fail-open `detectLegacyBrowser` (`src/lib/browserSupport.ts`, unit-tested on real UA
  fixtures) now gates `login/page.tsx` (async server component, `headers()` →
  `User-Agent`) and swaps in the server-rendered `UnsupportedBrowserNotice` — works
  with zero JS, replacing the form rather than decorating it. Scoped to /login so the
  PWA precached-shell invariant for `/` is untouched (the only route that flipped
  static→dynamic); legacy browsers are documented as unsupported, not downleveled
  (`docs/browser-support.md`, `AGENTS.md`, `docs/user-guide.md` §1.11)
- 1.175 Cross-department calendar access in Users (migration 0032
  `user_calendar_access`): a user form's "Department access" section grants other
  department calendars at `reader|writer`; the rows record intent and the unified
  reconcile (`reconcileUserAccessChange` with `userId`/`desiredAccess`) diffs rows,
  then re-syncs the affected calendars' managed expectations (members + grants)
  and revokes emails no longer expected — so removals/role changes/email changes/
  department moves all reconcile. Department detail's "Calendar access" now shows a
  read-only **Granted access** group between assigned users and **Additional
  access** (which is for people without a user account only), and
  `grantDepartmentAccess` **blocks** a roster user's email with a pointer to user
  settings. Legacy anonymous rules matching roster users are **adopted** into grant
  rows both on user create/email change (`adoptExternalAccessForEmail`, a
  department-by-department ACL scan) and on department read, and audit
  `user.create`/`user.update` payloads carry the sorted grant list (docs
  `roster-sharing.md` §1.5/§1.9/§1.10/§1.11; filter/access independence documented
  in `dashboard-views.md` §1.2 + `ui-state.md` §1.5.1 + `user-guide.md`/`admin-guide.md`)
- 1.176 User-menu Calendar Access self-service: the profile dropdown now shows the signed-in
  user's full display name with a `role · phone` subtitle, and a "Calendar Access" item opens a
  modal listing the calendars shared with them (own department as reader + cross-department
  grants at their role) — each row links "Add to my Google Calendar" (the `cid=` web link,
  mirroring the department modal) so non-admins can subscribe to their department calendars in
  their own Google account. Data comes from the new `getMyCalendarAccess()` server action
  (any authenticated session; the roster-profile DB read, no Google round-trip), the modal
  fetches on open with a render-phase reset, and the global Admin login gets an explainer
  instead of a roster. `phone` is threaded from the protected layout → `AppShellShell` →
  `UserMenu`; no schema or Google changes
- 1.177 Optimistic event mutations on the dashboard: creates/edits/deletes now show a
  **stand-in chip immediately** at confirm instead of after the serial Google writes +
  read-your-own-writes refresh (~0.5–3 s), via a short-lived client overlay (`optimisticOps`)
  merged into the server `events` prop by the pure, unit-tested `applyOptimisticOps`
  (`src/lib/events/optimistic.ts`); every view memo reads the derived `viewEvents`. The
  server actions now return the ids they already computed (Decision 3): `EventActionResult`
  success carries the group `eventId` + per-copy `{calendarId, googleEventId}` (`EventActionOk`),
  so the chip is pinned to real ids at `ok` and handed off to the authoritative refresh with
  no flicker. Wizard stays open through the action (Decision A) so rejections keep the exact
  field-error UX; settled ops are dropped by a guarded render-phase reconcile on the next
  props arrival; stand-in chips block detail taps (`isOptimisticStandIn`) until pinned.
  `buildOptimisticEvent` mirrors the action's normalization/time/title/color parity
  (`withSelfCreator`→`clampEventEnd`, exclusive all-day ends, view-template title,
  `eventTypes.color` now passed to the client). `docs/optimistic-mutations.md`
- 1.178 Shared admin PIN + clean single-field login (migration 0033
  `settings.admin_pin_hash`): `/login` keeps its single masked input (no mode toggle)
  and a lightweight routing probe `resolveLogin` (`src/lib/loginActions.ts`, hint
  only) decides the flow. **Staff** (`role='user'` only) types `[phone][keyword]` and
  is signed straight in — admin-role users are rejected on that path so the org-wide
  keyword can never yield an admin session. An **admin-role user** is instead asked
  for the **shared admin PIN** (`settings.admin_pin_hash`, seeded/reconciled from the
  **`ADMIN_PIN`** env var on every login — env-authoritative, no in-app path) in a
  modal before any session is issued; the phone-less **break-glass root** types
  `ADMIN_INITIAL_PASSWORD` alone (`settings.admin_password_hash`, same reconcile).
  `authorize` re-checks every credential and stays the sole session issuer + audit
  point (distinct failure reasons `admin.invalid_root_secret`/`admin.invalid_account`/
  `admin.invalid_pin`). `src/lib/bootstrap.ts` → `ensureSettingsRow` +
  `syncAdminSecretsFromEnv` (both envs compared on login, re-hashed only on change);
  `login.ts` drops the dead `classifyLogin`, adds pure `normalizePhoneDigits`; a new
  **Security** settings tab (`/settings/security`) holds the User Login Keyword moved
  out of General (General keeps retention + danger zone). `users.password_hash`
  remains unused; docs/`AGENTS.md` updated
- 1.179 Department-access Owner grants + own-department row: the user form's
  "Department access" grants can now be **Owner** — `ManagedGrantRole` widens to
  `reader|writer|owner` (the `user_calendar_access` role column stays a bare
  `text`, so no migration) and adoption paths keep a raw `owner` ACL rule instead
  of clamping it to reader. The user's own ("home") department now appears as the
  section's first **non-removable row** (no ✕) seeded from its live Google ACL
  via the plain read `getAssignedAccessRole`; changing its level writes straight
  to the ACL like the department modal's assigned-user selector (disabled with an
  explanation for email-less users or a drafted department move — render-phase
  reset + effect fetch only touch state in the async callback, no cascades). The
  permission dropdowns in the section render at the readable `sm` size (were
  `xs`), the `Calendar Access` self-service modal labels Owner (brand badge), and
  the copy/`formatManagedGrants` audit labels/docs/tests cover the third level
- 1.180 Pre-submit event clash warnings in the wizard: the review step runs the
  read-only `checkEventClashes` action, which re-resolves the candidate exactly
  like a create/update (shared chain moved to `src/lib/events/writeContext.ts`),
  reads the overlapping events on its target calendars from the month cache
  (`clashQuery.ts`), and runs the pure `computeClashes` engine — an event occupies
  its creator + tagged users + every active member of each tagged department
  (department-level event = everyone within), and external/people-less events
  occupy their own calendar's members. Warnings (per conflicting event, affected
  people, "you" chip) never block a save. `docs/event-clashes.md`
- 1.181 Double Booking page (`/double-booking`, bottom nav + sidebar for every role):
  an existing-event scan of double-bookings. It reads only the **scanned user's own
  department calendar** over the next 30 days (every event that occupies a user has
  a copy there), runs the pure `findUserClashGroups` — an event matters when it
  occupies the user; each connected component of the pairwise-overlap graph among
  occupying events is one report — and lists the overlap groups (shared people chips
  via the shared `clashUi.tsx` extracted from the wizard panel, amber cards,
  "External" badges). The read-only `checkUserClashes` action lets **admins scan any
  active roster user** (a `NoKeyboardSelect` target picker); regular users may only
  scan themselves. Advisory: never writes or audits. `docs/user-clashes.md`
- 1.181-2 UI polish for the page: responsive header (admin picker full column width on
  mobile, right-aligned 340px from the 40em band; pure-CSS `.c2-db-head` block), a
  status-announced result summary (`role="status"`), mirror-the-card loading skeleton,
  cleaner copy + footnote; and the **live Double Booking nav count pill** — the Double
  Booking entry shows the acting user's exact overlap count (hidden when 0/none),
  fetched by `AppShellShell` via `checkUserClashes({})` on mount, tab refocus, and
  after every successful create/update/delete (trailing-debounced ~400ms) through the
  new `cloudy2:events-changed` window event (`src/lib/ui/eventChanges.ts`, dispatched
  from the dashboard's two post-mutation completion points). No engine/schema changes;
  badge reuses the existing scan.
- 1.182 Dev-ops docs refresh: README gains a **Development & deployment (at a glance)**
  section (§1.4) — moving parts, the `ci.yml` pipeline, and a hosting-environments
  table, with Mermaid diagrams and the Cloud Run shadow + env isolation surfaced
  (Documentation renumbered §1.5); `docs/developer-guide.md` §1.7/§1.8/§1.9 diagrams
  redrawn to mirror `ci.yml` (quality → branch-gated migrate jobs → deploy-cloudrun +
  the independent Vercel build lane) and §1.9 gains a hosting-tier diagram; progress
  §1.1 quality-gate bullet names all three push paths
- 1.183 Double Booking admin target picker: the page's `NoKeyboardSelect` dropdown was
  replaced with the shared **`UserSelectModal` badge dialog in a new optional `single`
  mode** (tapping a badge replaces the current pick; Confirm disabled while empty) —
  per-department badge sections with the shortname as a search term (the admin roster
  prop now carries `shortname`), opened from an Invited-Attendees-style "Check another
  person" label + light Select button with a current-target chip ("Name · Department")
  or a dimmed "Checking your own schedule" when scanning self; `.c2-db-picker` is
  content-sized on desktop instead of a rigid field. Multi-select callers (event
  invitees, dashboard/parade filters, KAH members) are unaffected.
  `docs/user-picker.md` §1.2 documents `single`.
- 1.184 Cold-start readiness indicator: a **once-per-launch** confirmation that all first-paint
  data has loaded, replacing the ambiguous "watch the pinned pill text" gauge. The shell's two
  mount fetches (pinned events, double-booking count) become tracked legs of a pure phase
  machine (`coldStartReducer` + route allowlist in `src/lib/ui/coldStart.ts`, unit-tested):
  amber in the activity bar's slot while they settle, then a brief green `.c2-ready-bar` +
  live-region "Calendar up to date" once the landing route's content has streamed too (content
  **required** for the heavy routes — dashboard/parade/double-booking/KAH/audit log via
  `useColdStartContent`; light routes waive it). MIN 250 ms / MAX 4 s / dwell 1.2 s; runs once
  per shell mount, never re-arms on soft navigations; the pinned pill keeps its static look but
  its accessible name now distinguishes loading / settled-empty / failed (`pinnedStatus`).
  `docs/loading-transitions.md` §1.13.1
- 1.185 Shared trigger/summary layer above `UserSelectModal`: the duplicated "label row +
  trigger button + selected-badge summary" markup is extracted into presentational
  `PickerField`/`PickerBadges` (`src/components/PickerField.tsx`, `PickerBadgeItem` entries
  carry per-item colors) — the event wizard's Invited Attendees, the KAH member field
  (count label, "Choose" trigger, "No members selected." empty state), the Double Booking
  admin "Check another person" picker (self-scan empty text) and FilterModal's
  `search`-variant group summaries (cap 5 + "+N" overflow, "All …" empty text) all render
  through the one component tree; badge look normalized to `variant="light"` md chips with
  semantic colors (creator=brand, departments=accent, target=brand) kept as data; each
  caller still owns its modal + confirm wiring (`docs/user-picker.md` §1.6)
- 1.186 Department sections in the user pickers follow the Settings → Departments order:
  `buildUserGroups` gained an optional per-user `departmentSort` (the department's
  `calendars.sort_order`) — sections now sort by that rank ascending (the flattened
  preorder read top-to-bottom like the Settings list), ties by name, sections without a
  rank alphabetically after the ranked ones, "No department" last (callers that don't
  supply a rank keep the old alphabetical order, so it is backward compatible). The
  `sort_order` every server page already received from `listUsers()` is now threaded
  instead of dropped: event-wizard invitees, dashboard + parade-state Users filter
  options (`FilterOption.departmentSort` → `FilterModal.searchGroupPickerGroups`),
  Double Booking scan targets, KAH `pickerUsers`, and audit-log Actors (whose unmatched
   "Admin"/deleted names stay in a trailing unranked "Other" section); the
   calendar/department grid chips were already `sortOrder`-ordered. Pure sorting +
   section tail unit-tested (`docs/user-picker.md` §1.3, `docs/roster-sharing.md` §1.7)
- 1.187 Create/edit event wizard UX: the wizard body is now a fixed-height flex column
  (`WIZARD_BODY_HEIGHT`, viewport-aware) whose step content scrolls internally, so the
  modal no longer resizes between steps and the Back/Next/Submit bar never jumps; a
  bottom **step strip** above the action bar — a caption always naming the current step
  and position plus a compact non-wrapping Mantine **Stepper** (numbered circles joined
  by connector lines; passed = check, current = filled) — lets the user jump to any
  section as a **free jump** (the old bottom "Go to Summary" anchor's semantics, now
  gone); a step change resets the body scroll and announces `Step N of M: <name>`
  via the shell's polite live region. `docs/event-lifecycle.md` §1.4
- 1.188 Dropdown → badge-picker sweep (user/department picks): the event wizard's admin
  "On behalf of" creator step (the app's last `searchable` dropdown), UserForm's
  "Department to grant" add row, and the Department create/edit "Parent department"
  field all pick through `UserSelectModal` badge dialogs now — no searchable select or
  user/department dropdown remains. `UserSelectModal` gains `allowEmptyConfirm` so an
  optional single picker can commit a cleared selection ("blank = acting user" creator);
  the wizard shares one per-department `userPickerGroups` build between the invitees
  and creator dialogs; fixed role/dropdown lists (reader/writer/owner, event-type
  group, template target) are untouched. `docs/user-picker.md`,
  `docs/event-lifecycle.md`
- 1.189 Activity bar thickened + traveling light: the global activity bar's
  indeterminate amber strip doubles 2px → **4px** (both `.c2-activity-bar-active`
  and the cold-start green `.c2-ready-bar`, `globals.css`), and the old whole-bar
  opacity pulse is replaced by a bright warm-white **comet head sweeping
  left → right** across the strip (`::after` overlay, ~1.4 s crossing, clipped by
  the container's `overflow:hidden`; reduced-motion = the plain 4px strip). The
  in-place pulse was too thin/subtle to spot in peripheral vision; the thicker
  bar + moving highlight read as indeterminate progress at a glance. Pure CSS —
  no component/state/logic change, the cold-start `loading` phase inherits the
  comet via the shared class. `docs/loading-transitions.md` §1.13/§1.13.1,
  `AGENTS.md`
- 1.190 Activity bar no longer blips on quick loads + no abrupt vanish: the bar
  now only appears once a busy source has persisted `ACTIVITY_SHOW_DELAY_MS`
  (300 ms) — warm-cache page switches/refreshes that finish sooner never flash it
  (the previous immediate-show policy showed a split-second bar on *every*
  navigation) — and its exit is animated: after the existing 150 ms min-hold the
  class drops and CSS retracts/fades the strip over ~230 ms (destination-state
  `transition` trick: the base rule carries the slow exit, the active rule a
  ~120 ms pop-in; disabled under reduced motion). The `ActivityBar` timer logic
  moves from render-time `prevBusy`/`held` tracking to effect-driven show/hold
  timers; cold-start readiness is untouched (its bar is mounted/dismounted whole
  elements, no class flip). `docs/loading-transitions.md` §1.13, `AGENTS.md`
- 1.191 Per-type hidden Location step (revised: the category-lock in the original 1.191
  was over-built — an admin can already restrict a type to one location via the matrix;
  the ask was only to hide the Location step). `event_types.show_location` (boolean,
  default true; migrations 0035 add / 0036 drop the superseded `locked_location` of the
  original): a "Show location in the event form" toggle in Settings → Event Types
  (Event form block), usable only when the Allowed locations matrix has exactly one
  category (disabled otherwise; widening the matrix re-shows the step). When off, the
  wizard's Location step is **skipped entirely** and every event of the type saves in
  its sole allowed category with no specific place (client seeds/re-clamps on type
  change + edit/duplicate prefill; the server re-enforces in `resolveEventLocation`,
  writeContext) so even re-saving a legacy event converts it — the
  show-remarks/show-invitees hidden-field pattern applied to location.
   `docs/event-lifecycle.md` §1.9.2, `docs/admin-guide.md` §1.4
- 1.192 Event organizer & collaborative editing rework: the organizer (`createdBy`) is
   fixed to the acting user at create and never changes — the admin "On behalf of"
   wizard step is gone. The organizer is no longer auto-added as an attendee
   (`withCreatorInvited`/creator lock removed; edit prefill keeps stored attendees,
   deselectable). Edit/delete/duplicate now opens to the organizer, individually tagged
   attendees, and active members of tagged departments via pure `modifyGuard` (+ new
   notes `ownerOnlyEdits` organizer-only lock the organizer/admin may set; admins always
   bypass). Occupancy is decoupled — the organizer counts only when self-invited — across
   schedule rows, the clash/double-booking engine, KAH away counts, the Myself filter +
   amber "mine" highlights, `{people}` title tokens and Parade State. `guards.ts`
   replaces `creatorGuard`/`ownershipGuard`; `validate.ts` replaces
   `withSelfCreator`/`withCreatorInvited` with `resolveEventAuthor`. Docs:
   `docs/event-lifecycle.md`, `docs/event-mutations.md`, `docs/event-clashes.md`,
   `docs/admin-guide.md`, `docs/user-guide.md`
- 1.193 Event wizard "Other settings" step + Participants rename: the wizard's always-
   present "Pin this event" and "Only the organizer can edit this event" switches move
   onto a new **Other settings** step between Remarks and Review (so even invitees-hidden
   types can pin/lock; the review step drops its redundant Pinned row). "Invited
   Attendees" is renamed **Participants** everywhere user-facing (wizard picker + step
   chip + review row, EventDetail, audit detail labels/counts, event-type settings
   toggle "Show participants", table badge "No participants", webhook payload guide);
   internal identifiers (`invitees`, `showInvitees`) unchanged. No behavior/logic
   change.
- 1.194 Participants "Add myself" toggle + clearer owner-lock wording: the wizard's
   Participants step gains a compact **Add myself / Remove myself** button below the
   badges (pure `toggleInviteeUser` in `userSelect.ts`) so the organizer (or anyone)
   self-invites without opening the picker dialog. The Other settings owner-lock switch
   is per-actor labelled: "Only I can edit this event" to the organizer (create flow and
   own events), "Only the organizer can edit this event" to an admin editing someone
   else's event — server semantics unchanged (`guards.ts` message + EventDetail badge
   keep the organizer wording). Docs/changelog below.
- 1.195 "(You)" participant highlight: the signed-in user's badge is marked wherever
   participants are listed — wizard Participants step, wizard Review Participants row,
   and the EventDetail modal's Participants list — via a shared `.c2-my-badge` amber
   mine treatment (cream `--c2-my-row-tint` fill + `accent-6` ring + a "(You)" suffix;
   `globals.css`, double-scoped to beat Mantine and work in modal portals). `PickerBadgeItem`
   gains an optional `self` flag; EventForm's review People and EventDetail's Participants
   resolve id-keyed (not name-keyed) so the current user is detected even with duplicate
    display names. Presentational only.
- 1.196 Post-review hygiene on the organizer/participant rework: the owner-lock switch on
   the wizard's Other settings step is keyed off the **stored** organizer
   (`payload.creatorId`, mirroring `canChangeLock`), so a non-admin editing a creator-less
   event no longer sees a switch the server would silently drop (they are adopted as the
   stored organizer on that save, so the switch appears from their next edit). Events can
   no longer be saved with no one on them: a fresh create **pre-selects the acting user as
   a participant by default** (deselectable), and an all-empty invitee set is rejected both
   in the wizard (bounce back to the Participants step before any optimistic chip is
   staged) and server-side (`createEvent`/`updateEvent` refuse an effective input with no
   attendees and no tagged departments, "Add at least one participant or department").
   Docs/comments: organizer adoption reworded to "acting editor"; AGENTS.md, event-lifecycle,
   user-guide, user-picker, event-mutations.
- 1.197 Refresh re-homed + pull-to-refresh disabled: the dashboard ⋮ kebab's Force refresh
   and the "Saved · HH:MM" freshness indicator are removed, and native pull-to-refresh is
   disabled app-wide (root-scroller `overscroll-behavior-y: contain`, `globals.css`). The
   profile menu (all pages) gains **Force refresh**: a full-page reload to a one-shot
   `?refresh=<epoch-ms>` URL the SW never caches (`ONE_SHOT_PARAMS`) — a network render on
   every page (Settings included, fixing the stale-data-on-pull symptom that was SWR-served
   cached docs/RSC); `/dashboard` still honors the nonce → forced Google read. The nonce is
   stripped after the reloaded document mounts by the new global `useOneShotRefreshStrip`
   (`src/lib/pwa/client.ts`, mounted in `AppShellShell`, RSC path entries cleared before the
   clean-URL `router.replace`). `googleConfigured` threads layout → shell → profile menu so
   the item greys out on the calendar when Google is unconfigured.    `docs/events-cache.md`
   §1.5.1, `docs/pwa-offline.md` §1.11, `docs/loading-transitions.md` §1.5/§1.7/§1.12/§1.13,
   `docs/immersive-mode.md`, `docs/dashboard-views.md`, `docs/user-guide.md`, `AGENTS.md`
- 1.198 Create/edit event modal makes use of the viewport: the wizard's sizing is no
   longer locked to phone tiers everywhere. The host modal keeps `xs`/`sm` on phones
   but widens `md` (440px) → `lg` (620px) once the shell reaches the wide-desktop band
   (≥800px, `DESKTOP_WIDE_MEDIA_QUERY`, `DashboardView`), and the fixed body height
   grows on the desktop shell (`WIZARD_BODY_HEIGHT_DESKTOP` = `min(68dvh, 720px,
   calc(100dvh - 200px))`) while phones keep the compact `WIZARD_BODY_HEIGHT_MOBILE` —
   the height stays a pure function of the viewport, never of the active step, so the
   pinned step strip and Back/Next/Submit bar never move. At `lg` the review step's
   definition rows reflow into a two-column grid beneath the full-width calendar
   preview / clash check; the shrink-out motion feeds on the form's own
   `formContentWidth` so the zoom still lands on the originating button.
   `docs/event-lifecycle.md` §1.4, `docs/desktop-responsive.md` §1.7, `AGENTS.md`
- 1.199 Event wizard is a bottom sheet on phones: below the desktop band the host
   modal (`DashboardView`) stops centering and bottom-docks — `.c2-event-form-sheet`
   (`globals.css`) bottom-aligns Mantine's modal inner and drops its symmetric y
   gutter (`yOffset="0px"`), so the sheet sits flush with the screen's bottom edge and
   the body fills from there up (`WIZARD_BODY_HEIGHT_SHEET` = `calc(100dvh - 132px)`,
   replacing the phone half-sheet cap), leaving a ~56px top gutter as the overlay's
   tap-to-minimize zone (the header's minimize chevron / X remain). The motion's
   grow/shrink collapses to the sheet's `center bottom` origin (the rect-pinned pivot
   assumes a centered modal); the bottom action bar clears gesture bars via an
   `env(safe-area-inset-bottom)` pad. Desktop (centered `md`/`lg`) is unchanged.
   `docs/event-lifecycle.md` §1.4, `docs/desktop-responsive.md` §1.7, `AGENTS.md`
- 1.200 Mobile bottom-sheet polish (sheet read too low): the "Tap outside to minimize"
   caption — which sat at the viewport bottom and now overlapped the docked sheet — is
   moved into the sheet's **top gutter** on phones (`DashboardView` branches it on
   `isDesktop`: bottom caption for the centered desktop modal, a `safe-area-inset-top`-
   aware top caption for the sheet). The gutter grows to ~68px:
   `WIZARD_BODY_HEIGHT_SHEET` = `calc(100dvh - env(safe-area-inset-top, 0px) - 144px)`
   (was `calc(100dvh - 132px)`), so the caption is clearly visible and there's a
   comfortable tap target above the sheet; the action bar's bottom clearance is bumped
   (`safe-area-inset-bottom` + `sm` spacing) so the Back/Next/Create bar isn't glued to
   the screen edge. Desktop centered modal is unchanged. `docs/event-lifecycle.md` §1.4,
   `docs/desktop-responsive.md` §1.7, `AGENTS.md`
- 1.202 On-demand dashboard Views (tabs): the fixed five-view dashboard is gone — the calendar
   is a per-account set of views (`user_dashboard_views`: renderer kind + user name + strip
   order + that tab's own Cal/Users/Types filters; duplicates allowed), created via a (＋)
   button at the end of the scrolling tab strip ("Add view": kind picker + name) and managed
   through an **Edit views** mode (↑/↓ reorder, tap-to-rename, delete — the last tab can't
   go). Filters are **server-side per tab** (`NULL` = role default, explicit array = the
   selection), applied/cleared via `saveDashboardViewFilters` + `router.refresh()` — the
   `cal/users/types` URL params, the `_fresh` machinery and the pin/unpin star UI are
   deleted. The active tab rides the URL as `?view=<tab id>` (legacy `<kind>` maps to the
   first tab of that kind), is remembered server-side (`user_preferences.dashboardActiveViewId`),
   and resolves URL → remembered → first tab; a single "Month" tab is seeded lazily under a
   `user_preferences` row lock. Scalar preferences moved server-side too (`user_preferences`:
   last-active tab + parade filters; zoom/sidebar/lastPage/date/month stay in the reduced
   device `cloudy2.ui` cookie — major v3). Period is preserved on same-kind and
   anchored↔anchored tab switches; route/cold-start loading is one plain box
   (`loading.tsx` + `public/loading.html`); in-page skeletons still shape to the kind.
   Break-glass admin has no rows (static Month tab, no management). Migrations 0037 +
   `user_preferences`/`user_dashboard_views`; `docs/ui-state.md` rewritten,
   `docs/dashboard-views.md` §1.1/§1.2/§1.8, `AGENTS.md`, `progress-archive.md`
- 1.201 Event wizard back to a centered modal (the bottom-sheet model was wrong — it gave
   unequal gutters and dragged the caption to the top). The host modal is `centered` at
   every width again; on phones the body **fills the centered box** to use as much
   vertical space as possible: `DashboardView` sets `yOffset="44px"` so Mantine centers
   inside a `100dvh - 88px` box and `WIZARD_BODY_HEIGHT_MOBILE` = `calc(100dvh - 164px)`
   fills it, leaving equal ~44px top/bottom gutters. The "Tap outside to minimize"
   caption returns to `bottom: 16` (it was over the sheet / at the top). The rect-pinned
   motion origin is restored (a centered modal again), and the `.c2-event-form-sheet`
   CSS + `WIZARD_BODY_HEIGHT_SHEET` are removed. Desktop keeps its capped height
   (`min(68dvh, 720px, calc(100dvh - 200px))`) unchanged. `docs/event-lifecycle.md` §1.4,
    `docs/desktop-responsive.md` §1.7, `AGENTS.md`
- 1.203 Month-grid zoom (fit-to-width): the Month view's default is now **zoom 100% =
   all seven day columns fit the viewport width** — Mantine's 84px `--min-day-width`
   floor is zeroed and the MonthView ScrollArea content (`monthViewInner`) is widened to
   `zoom × 100%`, so every column/event scales together. Zooming in (levels
   1/1.25/1.5/2/2.5/3, pure `src/lib/ui/monthZoom.ts`) overflows the grid into the
   dashboard's horizontal pan: the MonthView's ScrollArea gets its own `useGridPan`
   instance (`monthPan`) and the shared `GridNavControls` right-edge cluster (zoom +/−
   + pan arrows), which now takes a caller `zoomMin`/`zoomMax` range. Zooming keeps the
   centered day anchored (`reanchorScrollLeft`, no label column); the pinned weekday
   strip is sized to the same zoomed width so initials stay over their columns. Level
   remembered per device as `dashboard.monthZoom` (cookie minor v3.1, distinct from the
   Day/Week (H) `zoom`), read pre-paint and seeded server-side. Columns only —
   `maxEventsPerDay`, cell height and the day modal are unchanged. `docs/dashboard-views.md`
    §1.8 (the file index becomes §1.9), `docs/grid-pan.md`, `docs/ui-state.md`,
    `docs/user-guide.md`, `AGENTS.md`
- 1.204 Participant notifications via Web Push (migration 0038 `push_subscriptions`
  + `user_preferences.event_invite_push`): after every successful event
  **create/update** (never delete), users **newly included** as participants are
  notified by browser push through `dispatchParticipantNotifications`
  (`src/lib/events/participantNotify/`, the `after()` best-effort pattern — never
  blocks/fails the mutation). "Included" = tagged users + **active members of
  tagged departments** (the clash occupancy model); the pure unit-tested
  `computeAddedUserIds` diffs old vs new occupancy against the mutation-time
  membership map, so a no-op/time-only edit adds nobody and the acting user is
  never notified. Recipients are filtered to active roster users with the
  account-wide master switch on and a stored `push_subscriptions` row
  (per-device endpoints, upsert-by-endpoint and re-`userId`d to the signed-in
  account on sync so a shared device never leaks another account's pushes; 404/410
  endpoints prune their row). Delivery needs the VAPID env trio
  (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`, one
  shared pair — without it push is skipped gracefully). The Serwist SW
  (`sw.ts`) gains `push`/`notificationclick` handlers that show the small payload
  and deep-link the event's details on tap; UX is the profile menu's
  **Notifications** dialog (`NotificationSettings.tsx`): enable on this device
  (permission + subscribe) + the pause switch, with iOS-installed-PWA-only and
  denied-state guidance. Audit rows `event.participantNotify`.
  `docs/event-notifications.md`, `AGENTS.md`, `.env.example`,
  `docs/developer-guide.md` §1.4/§1.9/§1.9.1/§1.12
- 1.205 Participant-push hardening + self-test: real-device QA found the
  Notifications dialog could spin forever when the service worker never became
  active (an unraced `navigator.serviceWorker.ready`), and every delivery
  failure was silent. The SW probe now resolves via `getRegistration()` with
  `.ready` raced against a timeout (`pushSwState`, `client.ts`), so the dialog
  always reaches a terminal state with specific copy for each failure (SW not
  ready → reopen/reinstall; server push unconfigured → VAPID env hint; blocked;
  unsupported; global Admin). Server actions return structured errors instead
  of throwing (with a "run the migrations" hint for a missing
  `push_subscriptions` table), settings expose `serverPushEnabled`, and a
  **Send test notification** button (`sendTestPush` server action) pushes one
  notification through the identical `web-push` path (shared `sender.ts`) and
  reports 403/401 (VAPID pair mismatch), 404/410 (stale endpoint → prune +
  re-enable prompt), or success.   `docs/event-notifications.md` gains §1.10.1
  troubleshooting (NEXT_PUBLIC rebuild, key-pair mismatch, two-account test,
  migration, audit/log tell-tales)
- 1.206 Participant push on the Cloud Run shadow: device QA showed the `*.run.app`
  PWA reporting "notifications aren't turned on for this server yet" because the
  `deploy-cloudrun` job (ci.yml) never passed the VAPID trio to the runtime
  `--env-vars-file` **or** the Docker build — and the image is built in GitHub
  Actions, so `NEXT_PUBLIC_VAPID_PUBLIC_KEY` was never inlined into the client
  bundle it ships (Vercel inlines at its own build; the Docker build needs an
  explicit build arg). ci.yml now feeds `NEXT_PUBLIC_VAPID_PUBLIC_KEY` as a
  `build-arg` to `docker/build-push-action` and adds all three VAPID vars to the
  service env map; the Dockerfile `builder` stage declares
  `ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `ENV` before `pnpm build`. `pushSwState`
  (`client.ts`) also polls `getRegistration()` a few times before the `.ready`
  race so a fresh install's first-open can't spuriously report the background
  service as not running. Docs `developer-guide.md` §1.9.1 + `AGENTS.md` gotchas
  updated (Cloud Run build-arg note)
- 1.207 Notification art on Android: the push `icon`/`badge` used the app tile
  (`icon-192x192.png`), a near-white rounded square that read as a blank/opaque
  square on Android's light notification surface and as a filled square in the
  status-bar badge slot. New dedicated assets — `notification-icon-192x192.png`
  (the cloud+movement mark recolored white over a full-bleed blue-gradient tile,
  so Android's crop turns it into the round app-icon look with no white halo)
  and `notification-badge-96x96.png` (same white silhouette on transparent,
  tinted monochrome in the status bar) — are wired into `sw.ts`'s
  `showNotification`. Both plus `.svg` sources are derived from `public/icon.svg`
  by the new `scripts/gen-notification-icons.py` (textual recolor +
  `rsvg-convert`, committed for regeneration); documented in
  `docs/event-notifications.md` §1.7/§1.11
- 1.208 Admin-customizable participant-notification content (migration 0039): the
  push title/body is no longer fixed copy — Settings → Templates gains an
  "Event Notification Templates" card (`NotificationTemplatesEditor.tsx`) editing
  per-reason (created/added) title+body templates stored on the `settings` row
  (`participant_notify_*`), rendered at dispatch time by `buildParticipantNotification`
  through the newly-shared `renderTokenTemplate` engine
  (`src/lib/settings/tokenTemplate.ts`, extracted from `formatEventTitle`, which now
  just supplies its event-title resolver) with `{title}`/`{type}`/`{time}`/`{location}`
  tokens + `< >` conditional groups; defaults + blank-field fallback live in
  `participantNotify/templates.ts`; `updateParticipantNotificationTemplates` server
  action (admin, audit diff, revalidate) with pure `validateParticipantNotifyTemplates`
  (single-line, ≤140 title / ≤300 body); live sample previews reuse the real builder.
  `docs/event-notifications.md` §1.11/§1.12, `docs/event-lifecycle.md` §1.8.1,
  `AGENTS.md`, `progress-archive.md`
- 1.209 Dashboard-views ergonomics: a chevron **All-views popover** beside the strip
  gear (accounts with >1 tab) lists every tab (kind icon + name, active ticked) for a
  one-tap jump without scrolling an overflowed strip; and Edit views rows gain a
  **type** control opening the shared five-kind picker (`ViewTypePicker.tsx`, now also
  used by Add view) so a tab's renderer kind can be changed after creation —
  `changeDashboardViewKind` server action keeps the tab's id/order/filters and follows
  the old kind's default label when the name never left it (pure `nameAfterKindChange`,
  unit-tested); changing the active tab's type re-navigates through the usual
  tab-switch period rules (`docs/dashboard-views.md` §1.1)
- 1.210 Structured event-title recipes replace the free-text token/`< >` templates
  (migration 0040): a title is now an ordered list of fields (`type`/`description`/
  `people`/`departments`/`location`/`time`) with per-field style/wrapper/connector,
  authored in a picker (`RecipeTemplateForm.tsx`) instead of hand-typed `{token}< … >`
  text — so an empty field can never leave dangling punctuation (`OL:, …`, `(LZH )`);
  pure `titleRecipe.ts` (types, `renderTitleRecipe`, `sanitizeTitleRecipe`,
  `validateTitleRecipe`) replaces `formatEventTitle.ts`, stored as JSONB
  (`settings.event_title_recipe`, `event_title_templates.recipe`; legacy text columns
  kept for rollback, never read); consumers rewired (`eventTitle`,
  `eventTitleDisplay`, `pinned`, `writeContext`, dashboard page/`DashboardView`/
  `EventForm`, settings queries/actions/UI); existing templates reset to the default
  recipe (migration deletes library rows + clears assignments); notification content
  templates keep their own free-text editor. `docs/event-lifecycle.md` §1.8,
  `AGENTS.md`, `progress-archive.md`
- 1.211 Templates UI overhaul to the app's manage-row/dialog conventions: the Settings →
  Templates page is now three manage-row group cards (Event title templates with Master +
  saved rows + Add/Assign, Display names, Event notification copy) whose editors open in
  centered dialogs (`TemplatesManager.tsx`); title templates are authored as chip rows with
  a six-field card picker (add) and chip/Segmented options (style/wrapper/connector) — no
  stacked dropdowns — reordered with a reduced-motion-safe CSS FLIP (`src/lib/ui/flipReorder.ts`);
  notification copy editing moves into a dialog with a New-event/Added reason switch and a
  contextual token-insert strip with auto "uses:" token badges (`NotificationCopyEditor.tsx`);
  old `TemplatesForm`/`RecipeTemplateForm`/`NotificationTemplatesEditor` deleted. A pass across
  the other settings tabs confirmed they already follow the manage-row/badge conventions.
  `AGENTS.md`, `progress-archive.md`
- 1.212 Unified, template-driven notifications + recipe text segments: recipes gain a literal
  **Text** field (prose segment, shown only when non-blank) usable by every template;
  **notifications now reuse the same template system** — two new assignable targets
  `notifyCreated`/`notifyAdded` render the push body (title = the event's rendered title)
  with built-in default copy in `notifyRecipes.ts` (intro `text` segment + description ·
  location · full wall-clock time via a `timeFull` renderer override), so the separate
  notification-copy editor/action/modules are gone (`NotificationCopyEditor`,
  `updateParticipantNotificationTemplates`, participantNotify token message/validate/tests
  deleted; `participant_notify_*` columns deprecated, never read). The Master template now
  sits in the list as an **unremovable** row (disabled delete + lock hint) and templates can
  be **duplicated** (row copy icon + edit-dialog Duplicate → `duplicateEventTitleTemplate`,
  unique "Copy of X" labels). `docs/event-notifications.md` §1.11 rewritten,
  `docs/event-lifecycle.md` §1.8/§1.8.5, `AGENTS.md`, `progress-archive.md`
- 1.213 Department hierarchy reaches the user & department pickers/filters: the shared
  `buildUserGroups` (`src/lib/users/userSelect.ts`) now keys id-carrying members by their
  department **id** and tags each section with a nesting `depth` (ancestors that also have
  members in the picker), so per-department **user sections** in the badge dialogs render
  indented under their parent. **Department pills/chips** (Calendars/Department filters,
  Participants departments, Parent/grant pickers, own-department badges) stay compact
  wrapped badges whose labels carry the full **ancestor chain** ("HQ › Logistics › Stores"
  via `departmentPathLabels` + `departmentPickerOptions`) — hierarchy reads inside the
  badge, not as indentation. Server pages thread `parentId` + per-user
  `departmentId`/`departmentParentId` (from `listCalendars()`) into the dashboard/parade
  filters, event invitees, double-booking targets, KAH members and audit-log Actors;
  `roster/hierarchy.ts` gains preorder `departmentTreeRows` + `departmentPathLabels`.
  Pure grouping/rows/labels unit-tested (`docs/user-picker.md` §1.2–§1.4,
  `docs/roster-sharing.md` §1.7)
- 1.214 FLIP reorder animation on every manageable list: the title-recipe builder's slide
  (CSS FLIP in `src/lib/ui/flipReorder.ts`) now covers **all** reorderable lists through
  one shared hook `useReorderRows` (`src/lib/ui/reorderRows.ts`) — dashboard views
  (Edit views), event-type groups, departments and quick links — as an **optimistic**
  reorder: tapping an arrow slides the row instantly (snapshot → local re-order → play),
  the server write runs in the background and the list reconciles to the server order
  when the refresh lands (a failed write snaps back), so the chevron spinners are gone
  and reorder arrows disable while a write is in flight. Server-backed lists keep a pure
  key override until the authoritative props catch up (render-phase reconcile, never an
  effect); whole-subtree department moves and event-type-group/quick-link swaps reuse the
  existing pure `moveInTreeOrder`/`moveEventTypeGroupOrder`/adjacent-swap predictors, and
  surfaces with mobile-card + desktop-table twins measure each `data-flip-container`
  separately (hidden lists never animate). Pure helpers (`keysEqualOrder`,
  `sameKeyMembership`, `overrideIsStale`, `swapAdjacent`) unit-tested; the dashboard-views
  Edit-views modal persists the full predicted order, so chained moves stay exact;
  `AGENTS.md` manage-row bullets updated
- 1.215 Half-day-aware clash detection: `half` events now occupy only their AM/PM half
  (`halfDayRange` in `datetime.ts`, UTC+8 `00:00`–`12:00` / `12:00`–`24:00`) when the
  wizard pre-submit advisory (`checkEventClashes`) and the Double Booking scan
  (`checkUserClashes`) compare windows — an AM half-day no longer warns against a PM
  event on the same day, while two same-half overlaps (and any half vs a `full` day)
  still Clash. The engine (`clashes.ts`) carries `timeOption`/`startAmPm`/`endAmPm` on
  both existing-event inputs and the candidate, resolving the effective sub-day window
  via `effectiveEventWindow`/`effectiveCandidateWindow`; a legacy `full` event with
  stray markers keeps its full-day window. Purely detection-side — grading, storage
  and KAH (day-level busy-days) are untouched.
- 1.216 Auto-refresh on return from background: a tab left running goes stale and
  misses deploys, so `useInactivityRefresh` (`AppShellShell`) soft-refreshes when
  the tab returns after >5 min hidden and
  `useSWUpdateReload` (`AppProviders`) calls `registration.update()` on the same
  `visibilitychange` so a deploy that landed meanwhile triggers the existing
  `controllerchange` takeover reload instead of an old-build 404 hang. Fixed:
  the data refresh now drives the **same one-shot `?refresh` force-read** as the
  header Force refresh (soft `router.replace` to a nonce URL → dashboard
  force-reads Google → nonce stripped after commit; a bare `router.refresh()`
  returned the same stale events cache, so the grid never visibly changed), the
  transition pending flag is reported on the activity bar, and the firing is
  hardened with `blur`/`focus`/bfcache `pageshow` fallbacks. Pure
  `INACTIVITY_REFRESH_MS`/`needsInactivityRefresh` in `swRules.ts`, unit-tested
  (`docs/pwa-offline.md` §1.17).
- 1.217 Parade State attendance-mode clarity (UI-only, binary model kept): the entry
  button (desktop nav-row "Attendance", mobile FAB) is now a **true toggle** — in mode it
  becomes "Done"/check (mobile FAB) and no longer hides Exit inside a menu; a teal
  **attendance mode bar** under the date row carries the live `X/Y present` count, a
  Copy button, and a Reset overflow with **Clear this day** (per-date, immediate) vs
  **Clear all dates…** (the destructive confirm); the per-card `Checkbox` is replaced by a
  non-interactive status glyph so the **card itself is the single toggle** (`aria-pressed`,
  keyboard via the shared `activatable`); section headers + summary Total now say
  `X/Y present` in attendance mode vs `X/Y in camp` otherwise (same format, explicit
  metric); the copied report headers read `(X of Y present)`; the mode survives a reload
via `?attendance=1` and `attendanceStorage` became a `useSyncExternalStore` external
   store (stable snapshot identity, cross-tab storage events); "Saved on this device only"
   caption in the mode bar (pure store snapshots unit-tested;
   `docs/user-guide.md` §1.7, `docs/roster-sharing.md` §1.7)
- 1.218 Banner/initial-loading alignment fix: the announcement banner is no longer
  **streamed** — `(protected)/layout.tsx` resolves `getBanner()` in parallel with the
  session and passes `bannerConfig` to `AppShellShell` as a prop, so `bannerActive`
  (`bannerConfig !== null`) is known on the shell's very first render. A configured
  banner therefore grows the header and positions the route skeleton correctly from
  first SSR paint (no post-hydration jump), and a null config still reserves nothing —
  the old streamed design's trade-off between "phantom-gap collapse when no banner"
  and "mid-load shift when one appears" is gone entirely (the KAH probe stays
  streamed). `ShellBanner`/`BannerPlaceholder`/`BannerLoaded`/`setBannerActive` are
  deleted; `AnnouncementBanner` is exported and rendered directly by the shell
  (`docs/announcement-banner.md` §1.1/§1.3/§1.3.1, `docs/loading-transitions.md`
  §1.4/§1.13.1)
- 1.219 Informational event types excluded from conflict checks (migration 0042
  `event_types.exclude_from_clash`, default false): a "Exclude from conflict checks"
  toggle in the event-type form marks a type informational, and its events are ignored
  by the clash engine in **both** directions — they never trigger a conflict and are
  never checked themselves (`computeClashes` skips an informational candidate;
  `busyUsersOfEvent` occupies nobody) — and drop out of the Double Booking scan. The
  flag is resolved **live** from the type name stored in the notes block
  (`clashQuery.ts` + `listEventTypes`; `writeContext.ts` threads the candidate's flag),
  so toggling reclassifies every event of that type, past and future. Form/table badge,
  audit diff/labels, pure-engine tests, and docs (`event-clashes.md`,
  `user-clashes.md`, `event-lifecycle.md` §1.9.1) updated.
- 1.220 Bespoke action-pill toast (docs/action-pill.md): the Mantine
  `notifications.show({ message: <Button/> })` "View event" toast is replaced by a
  reusable, themeable floating pill — a centered `<button>` above the bottom nav whose
  body is a **darker** color with white text and whose **lighter** color sweeps across as
  a progress fill (`empty` = countdown to auto-dismiss, `fill` = grow then persist;
  per-call `lightColor`/`darkColor`/`duration`, defaulting to the brand blue pair
  `brand-3`/`brand-7`). Legibility on both tones uses a duplicated label: white over the
  dark body + a dark copy clipped to the light fill via `clip-path`. `ActionPillProvider`
  + `useActionPill()` mount in `AppProviders`; EventForm's post-save success now calls
  `showActionPill({ title, label: "View event", onAction })` (plain green/red
  notifications untouched); `.c2-action-pill*` CSS in globals.css; reduced-motion snaps
  the sweep.
- 1.221 Keyboard-free event wizard: the create/edit modal no longer needs the on-screen
  keyboard for anything except the optional Remarks textarea — the date/time inputs are
  natively read-only via the styles-API `attributes` (never the `readOnly` prop, which
  also disables their popovers), so tapping opens only the calendar/time dropdown; a new
  `TimeChipSelector` (horizontally scrollable hour row 00–23 + fixed minute row
  00/15/30/45) sits above each `TimePicker` for two-tap times; and the Location step
  gains a "Recent locations" chip row of the acting user's own past destinations
   (`fetchRecentLocations` server action, month cache, most recent first, at most 8) that
   fills the `TextInput` on tap (`docs/event-lifecycle.md` §1.4.1)
- 1.222 System-bar sync `removeChild` crash fix: `SystemBarSync` removed Next's
   React-hoisted `<meta name="theme-color">` (from `viewport.themeColor`) and appended its
   own node, so React's later `<head>` re-render (soft navigation) deleted a detached
   hoistable fiber → repeated `can't access property "removeChild", finishedRoot.parentNode
   is null`. The meta is now rendered by `SystemBarSync` and remounted via React (a
   hydration-flipped `key`): `viewport.themeColor` is gone, the component's SSR output is
   the pre-hydration meta (manifest `theme_color` still backs the splash), and React
   itself removes/inserts the node at hydration and on each scheme change — the same
   fresh-node swap Chrome needs, with no detached-node deletion (bugfix)
- 1.223 Search / Pinned / note deep links no longer switch the active view or touch
   filters: clicking a search result (or any `?event=` link) opens the target's details
   on the **current** tab — the search link now carries `?view=` for the active tab
   (`buildEventDeepLink`, pure + unit-tested), so it can't fall back to the remembered
   tab, and `_eventCal` is no longer added to the grid's fetch set. The server instead
   resolves that one event separately (its own calendar, empty type/user filters) into
   `deepLinkEvent` on the snapshot record root (never cached), so an event the active
   filters hide still opens **without leaking a chip** into the grid or altering any
   saved filter; the same-period case (`_eventCal`/`event` are absent from
   `dashboardRequestKey`, so no refetch) is covered by a ref-guarded one-shot refetch in
   `DashboardScreen` plus a "pending" deep link in `DashboardView` that opens the modal
   once `deepLinkEvent` lands (bugfix; `docs/event-search.md` §1.9,
   `docs/event-lifecycle.md` §1.4.2, `docs/loading-transitions.md` §1.7,
   `docs/ui-state.md`, `docs/pinned-events.md`)
- 1.224 Instant dashboard tab switches via preload: after the active context is fresh and
   idle, `DashboardScreen` calls the new `preloadDashboardTabs` action once per anchor (the
   tab set + the months those tabs need), deferred to `requestIdleCallback` and skipped
   offline; `buildDashboardPreload` resolves the shared config once and does a single
   `readCalendarRange` over the union of every tab's calendars/months, then projects each
   tab (`projectRangeEvents` + `resolveDisplayTitles`) into a delta, and the client
   `assembleDashboardSnapshot`s each into the warm map + IndexedDB — so a tab switch paints
   with no server round-trip (revalidating only past `WARM_SNAPSHOT_FRESH_MS`). The read
   never forces Google (it warms what the active read fetched; only cold `(calendar, month)`
   combinations fetch), `MAX_SNAPSHOTS_PER_USER` rises 6 → 12 to hold the preloaded tabs,
   and a mutation / force refresh bumps a generation ref so an in-flight preload can't
   repopulate stale records; `fetchRangeEvents` is now a thin wrapper over
   `readCalendarRange` + `projectRangeEvents` (no behavior change), with unit tests for the
   projector and the assembler (`docs/pwa-offline.md` §1.18, `docs/dashboard-views.md`
   §1.4, `docs/events-cache.md` §1.8, `AGENTS.md`)
- 1.225 Daily parade-state email (Settings → Parade State Email): admins pick roster
   recipients, a UTC+8 send time, and subject/body templates (shared `renderTemplate`,
   `{departments}` required); a new `CRON_SECRET`-protected `/api/cron/parade-state-email`
   route (triggered by Cloud Scheduler, not Vercel Cron) claims the day via the unique
   `parade_email_sends.send_date` and emails an org-wide snapshot derived from the same
   shared pure helpers as the parade page (`src/lib/parade/*`; attendance localStorage
   excluded), with a Send Test Now action; `settings` gains five `parade_email_*` columns,
   a `paradeState.emailSend` audit action is logged, and the KAH renderer now shares the
   generic template helper (`docs/parade-state-email.md`)
- 1.226 Loading-indicator fixes + per-view tab load state: (a) the global activity
   bar's refcount no longer leaks when a reporter unmounts mid-load —
   `useReportActivity` releases its key in the effect cleanup and the arithmetic moved
   to the pure, unit-tested `src/lib/ui/activity.ts`, so navigating away from the
   dashboard while a read is in flight can't leave the bar running until a full reload;
   (b) the activity bar's show/hold timers key on `busy`, not the cold-start phase, so
   the cold-start → activity hand-off is seamless (no vanish-for-the-green then
   reappear); (c) the cold-start legs and the first dashboard read are bounded by
   `withTimeout` (`src/lib/async.ts`), and a failed first read with nothing cached shows
   a retryable `EmptyState` instead of an endless skeleton; (d) each dashboard tab now
   shows its own view's load state — loaded solid, loading faded + breathing,
   not-loaded faded — via pure `tabLoadStates` + `DashboardScreen.tabStatus` on the
   existing data context; (e) `resolveDashboardConfig` batches its reads and single-tab
   accounts skip the preload's second config pass (`docs/loading-transitions.md`
   §1.13/§1.13.1/§1.13.2, `AGENTS.md`)
- 1.227 Instant dashboard tab switches (optimistic + prefetch) and a reflow-free
   grid swipe: a tab tap was still gated on the RSC round-trip because the data
   layer resolved the active context from `useSearchParams`, which only updates
   when the payload lands — even though the tapped tab's data was already warm in
   the device cache. `switchTab` now sets a `previewView` in
   `DashboardDataContext` and `DashboardScreen` resolves `candidateKey` /
   `presentation` / `displayRecord` / `tabStatus` / the fetch decision from
   `previewView ?? ?view=`, so a warm tab paints at once (and a cold tab fetches
   immediately, not after the URL commits); the preview clears when the URL
   catches up or after a 6 s revert window (`PREVIEW_REVERT_MS`), and
   `DashboardView` `router.prefetch`es each tab's target URL (the period rule
   extracted to pure `tabSwitchTarget`) so the URL catches up promptly. The grid
   swipe moved from a CSS class + `void el.offsetWidth` forced reflow to the Web
   Animations API (`el.animate`), removing a full-grid synchronous layout on every
   tab/date change (`docs/loading-transitions.md` §1.10/§1.13.2,
   `docs/dashboard-views.md` §1.4, `AGENTS.md`)
- 1.228 Parade-state email fixed to a weekday 08:00 schedule: Cloud Scheduler now fires
   `0 8 * * 1-5` (Asia/Singapore) and the in-app send-time setting is removed — the
   scheduler is authoritative, so `paradeEmailDue` keeps only the enabled/recipients/
   already-sent gates and the `settings.parade_email_send_time` column is dropped
   (migration 0045). The settings tab shows the schedule read-only and the test button is
   relabelled "Send test to my email" (it still emails only the acting admin); public
   holidays remain included, documented as a deliberate limitation
   (`docs/parade-state-email.md`)
- 1.229 View loads leave the global activity bar; the active tab carries the signal:
   the dashboard no longer reports its view/date navigations (`useReportActivity(isPending,
   "dashboard:nav")` removed) and a filter apply now calls `revalidate({ report: false })`,
   so the bar is reserved for refreshes with no in-page skeleton (post-mutation, view CRUD,
   settings, route navs). `DashboardScreen` gains a `refreshing` flag reported as
   `dashboard:refresh`. Because view loads no longer surface on the bar, `tabStatus` now
   forces the **active** tab to `loading` while any read of its context is in flight (cold
   nav, post-mutation refresh, filter apply), and the breathing pulse is stronger — opacity
   `0.35 ↔ 1` over 1.3 s (was `0.45 ↔ 0.8` / 1.6 s) (`docs/loading-transitions.md`
   §1.13/§1.13.2, `AGENTS.md`)

- 1.230 Android edge-to-edge for the bottom nav: the shell footer now uses Chrome's
   fast-path pattern (grow by `safe-area-max-inset-bottom`, pull down with
   `calc(env(safe-area-inset-bottom) - max)`) instead of Mantine's live-inset
   `padding-bottom`, which Chrome reads as a signal to keep its bottom chin and clamp
   the viewport. `--c2-safe-area-max-bottom` falls back to the live inset off Chrome,
   so non-supporting browsers keep the old exact behavior; the override is mobile-scoped
   (`max-width: 39.99em`) and `--app-shell-footer-offset` is re-declared (minus immersive)
   so AppShell main clears the footer's in-viewport height. The launch shell
   (`public/loading.html`) mirrors the pattern, guarded by `launchShell.test.ts`.
   Improves **browser-tab** compatibility only — installed WebAPK edge-to-edge is gated
   on Chrome shipping the fix (`docs/pwa-offline.md` §1.19)
- 1.231 Tab freshness indicators: the dashboard tab strip now distinguishes five states
   instead of three — `fresh` (solid), `stale` (warm snapshot older than the 60 s window,
   background tabs: a small static amber dot), `queued` (the background preload is warming
   it: a pulsing amber dot), `loading` (a read for the active tab: fade + breathe), and
   `not-loaded` (static fade). The active tab is always `fresh` unless a read is in flight.
   `tabLoadStates` (`snapshot.ts`) takes `freshKeys`/`staleKeys`/`queuedKeys`/`loadingKeys`
   + `activeTabId`; `DashboardScreen` computes them from `warmRecords`/`savedAt` via a
   **freshness tick** (a single scheduled timeout at the earliest record expiry, re-armed,
   no polling) so `stale` appears on time. `stale`/`queued` render an absolutely-positioned
   `::after` dot on the `Tabs.Tab` (no layout shift). Stale is indicate-only (tapping
   revalidates); the strip is not auto-refreshed (`docs/loading-transitions.md` §1.13.2,
   `AGENTS.md`)
- 1.232 Removed the stale/queued amber badge from the dashboard tab strip: the corner dot
   read as an unread-notification badge and confused users. The strip is back to three
   states — `fresh` (solid, any age), `loading` (active read: fade + breathe), `not-loaded`
   (static fade) — and `tabLoadStates` takes `warmKeys` + `loadingKeys` + `activeTabId`. A
   warm-but-old tab now just renders solid and revalidates silently on tap; the freshness
   tick and the `preloadBusy` tab signal were deleted (`docs/loading-transitions.md`
   §1.13.2, `AGENTS.md`)
- 1.233 Events no longer land in the organizer's home department unless the organizer is a
   participant: `deriveTargetCalendarIds` now derives the target set purely from
   participants (tagged users' departments + tagged departments), falling back to the
   organizer's department only when no participant carries one. Previously the organizer's
   department was always a target, so an event owned by Dept 1 with its only participant
   in Dept 2 got a copy in Dept 1's calendar and showed up when the dashboard Calendars
   filter was set to Dept 1. `refTargetCalendars` (update/delete reconciliation) keeps the
   old superset via a new `deriveLegacyTargetCalendarIds`, so copies placed under the
   previous rule are still found and removed on the next save/delete. Docs:
   `docs/event-lifecycle.md` §1.6, `docs/event-mutations.md`, `docs/event-clashes.md` §1.4
- 1.234 View management is discoverable again: the tab strip's only entry point used to be
   an unlabeled gear, with Add view buried two levels deep (gear → Manage-views modal → Add
   view), so users didn't find they could create/modify tabs. A **+** button is now the last
   item in the scrolling tab strip and opens the Add-view dialog in one tap; the gear gains
   a real Mantine `Tooltip` and is relabeled
   **Manage views** (aria-label/title + the modal title) — "edit" implied existing-only. Both
   keep the native `title` and open on touch tap (`events.touch`); hidden for the break-glass
   admin (`canManageViews`). Docs: `docs/dashboard-views.md` §1.1/§1.9, `docs/user-guide.md`
   §1.3.1, `docs/immersive-mode.md` §1.4, `docs/ui-state.md`, `AGENTS.md`
- 1.235 Manage-views modal rework: the modal's rows were five cryptic icon-only controls
   (up/down/swap/pencil/trash) with no sense of which tab was active or what kind it was,
   and creation was a footer button opening yet another modal. Now the modal stays lean: a
   compact **Add view** button at the top reuses the strip's quick Add-view dialog (no
   inline form), each row shows the kind icon + name with a dimmed kind label **only when
   the name is custom** (default-named tabs no longer repeat themselves), the active row
   gets a quiet **accent left bar** (no badge), and the row actions are just **Edit** and
   **Delete** — both `variant="subtle"`, with the reorder pair switched to
   `ReorderUpDown`'s new `variant="subtle"` so a row isn't a wall of bordered boxes. Edit
   opens one dialog for name + type (kind applied first so a custom name typed there wins;
   replacing the separate inline rename and Change-type modal) and carries an **Edit
   filters…** button that closes the modal, switches to that view and opens its filter
   dialog once the tab is active (filters resolve server-side per tab). Docs:
   `docs/dashboard-views.md` §1.1/§1.9, `docs/user-guide.md` §1.3.1, `AGENTS.md`
- 1.236 Dual Pane dashboard view: a sixth renderer kind (`dual`) shows the Month grid and
   the Agenda list in one view — side by side at `lg` with a **draggable split handle**
   (device-remembered `dashboard.dualSplit`, clamp 25–75%, arrow keys + double-click reset),
   stacked below `lg`. It is day-anchored (one `?date=` anchor): nav-row chevrons move ±1
   month, the pane header moves ±1 day, and tapping a day cell selects it in the agenda pane
   (no day modal). Pure `src/lib/ui/dualSplit.ts`, new    `DualPaneView.tsx` + `DualPaneSkeleton`
   (reusing extracted `MonthWeekdayStrip`/`AgendaSwipeHint`); `dual` joins the title-template
   targets. Docs: `docs/dashboard-views.md` §1.9, `docs/ui-state.md` §1.5, `AGENTS.md`
- 1.237 Dual Pane overlap fix: the floating fullscreen toggle (fixed, 8px below the chrome
   and 8px inside the grid's right edge) sat exactly over the agenda pane's sticky day
   header, swallowing the day chevrons' taps. The header now reserves the toggle's box on
   its right (desktop side-by-side only; exported `FULLSCREEN_BUTTON_SIZE`/`EDGE_INSET`),
   and the toggle geometry is exported from    `FullscreenToggle.tsx` instead of module-private.
   Docs: `docs/dashboard-views.md` §1.9
- 1.238 Month & Agenda follow-ups: the month pane's event chips are now inert
   (no `onEventClick` + `tabIndex: -1`; a `c2-inert-event` class from
   `DualPaneView`'s renderEvent disables the chip's whole subtree in `globals.css`
   — Mantine re-enables `pointer-events` on the inner chip, so a root-only
   override left taps swallowed by the chip instead of reaching the day cell —
   so every month-pane tap falls through to the day-cell button with the correct
   cell date and selects the day in the agenda pane; day cells keep their roving
   tabindex), and the view is renamed from "Dual Pane" to **"Month & Agenda"**
   (kind id `dual` unchanged — no migration; tabs already created keep their
   stored "Dual Pane" name, new tabs default to the new label). Docs:
   `docs/dashboard-views.md` §1.9, `docs/user-guide.md`, `AGENTS.md`
- 1.239 Month & Agenda layout fixes: (1) the month pane's zoom/pan cluster stopped
   following the pane once it narrowed past half the viewport — `GridNavControls`
   clamped the edge controls to the **viewport's** midpoint; it now clamps to the
   **anchor's** own midpoint (identical for full-width grids, fixes the dual pane);
   (2) the two panes no longer scroll together — at `lg`+ (the app's desktop layout,
   which large phones like an unfolded Fold adopt) the whole view is bounded to the
   viewport's remaining height and each pane is a fixed-header column with its own
   vertical scroll (`overflow-y: auto` + `overscroll-behavior: contain`); below `lg`
   the panes stack and the document scrolls (calendar first, agenda below) as before.
   `MonthWeekdayStrip` gains a `sticky` prop (`false` inside the bounded pane), the
   agenda day header goes non-sticky at `lg`, and `DualPaneSkeleton` mirrors the
   bounded layout. Docs: `docs/dashboard-views.md` §1.9, `docs/grid-pan.md` §1.2
 - 1.240 Dashboard no longer remembers the last-active view: `setActiveDashboardView`,
   the `user_preferences.dashboard_active_view_id` column (migration 0046) and its
   read in `resolveRequestedTab` are removed, so a bare `/dashboard` always resolves
   `?view=` → first tab. The device snapshot hydration also stops painting the
   last-viewed tab on a cold load (it paints the first tab's cached context, else
   fetches), so a cold open always lands on the first view. `?view=` stays
   authoritative for deep links/reloads. `docs/ui-state.md` §1.2/§1.3/§1.7,
   `docs/dashboard-views.md` §1.1, `docs/pwa-offline.md` §1.18, `AGENTS.md`
 - 1.241 Month & Agenda narrow-screen behavior: below `lg` the agenda pane is no
   longer stacked below the month grid — it is hidden, and the month pane behaves
   exactly like the standalone Month view: chips open the event detail (live
   `renderMonthEvent` + `onEventClick`, no inert pass-through), a cell tap opens
   the shared agenda day modal (the Month view's `onDayClick` body extracted to a
   shared `openDayModal` helper), and the `+N more` popover works too. At `lg` and
   up the interaction is unchanged (inert chips, cell tap re-anchors the agenda
   pane). `DualPaneSkeleton` is month-only below `lg`. Docs:
   `docs/dashboard-views.md` §1.9, `docs/user-guide.md`, `docs/loading-transitions.md`
- 1.242 Per-tab loading bar → top-right spinner: each dashboard tab's `loading`
   state now shows a small traditional amber `Loader` in the tab's top-right corner
   (absolutely positioned, `aria-hidden`) instead of the sweeping bottom-edge bar;
   `fresh`/`not-loaded` states and the `tabStatus` / flicker-control model are
   unchanged. `.c2-tab-load-bar` + its sweep keyframes are replaced by
   `.c2-tab-spinner` in `globals.css`. `docs/loading-transitions.md` §1.13.2,
   `AGENTS.md`
- 1.243 Event-search modal launch + layout: the chunk now preloads at idle with a
   2s deadline (plus hover/focus/pointer-down/touch-start and a desktop ⌘/Ctrl-K)
   and the modal **mounts closed** the moment the preload resolves, so the first
   open is an instant `opened` flip (a dependency-free `EventSearchModalSkeleton`
   covers the racing-click case); recent searches are prefetched on mount instead
   of on open. The form collapses to a single toolbar row (input + Search + a date
   filter popover with From/To and a non-default badge), recent-search badges are
   a one-line chip row hidden once results exist, results get a count + active-range
   caption with Clear, and the column is capped at `min(72dvh, 680px)` with the
   list as the only scroll region (skeleton while searching, `EmptyState` for no
   matches, amber/purple mine/external row highlight via the action's new
   `myEventIds`, no autofocus). `docs/event-search.md` §1.5/§1.9/§1.12
- 1.244 Pinned-events ticker pills: the header pill drops its pin icon, the amber
   `1/N` count chip moves into the leading (icon) slot, and a new subdued
   days-remaining countdown chip (`5d` lower-d, `0d` for a same-day or
   already-started event, never months) takes the count chip's old slot between
   it and the rotating title; the countdown re-reads the clock every 60s so a
   single non-rotating event still rolls over at midnight (new pure
   `daysUntilDate` in `datetime.ts`, unit-tested). `docs/pinned-events.md` §1.4
- 1.245 Grid-nav controls no longer displaced by the grid-slide transform: the
   fixed pan/zoom cluster measured its anchor with `getBoundingClientRect`, which
   includes ancestor transforms — so for Week (D) and Month & Agenda (whose
   anchors sit inside the transiently transformed slide wrapper) a measurement
   taken mid-slide left the cluster displaced left/right until a resize. It now
   measures with the new transform-free `layoutRect` (`src/lib/ui/layoutRect.ts`),
   reads the anchor ref fresh, re-measures on a `layoutKey` flip (breakpoint +
   measured chrome height, passed by DashboardView / DualPaneView /
   WeekMatrixView), and measures in `useLayoutEffect`. `docs/grid-pan.md` §1.2
- 1.246 Week (Grid) all-day overflow trigger moved inline: the `+N more`
   `MoreEvents` no longer sits in the date-nav row — it overlays the strip's
   sticky-left "All day" cell (hidden via `fontSize: 0` while the trigger shows),
   anchored to the now-`position: relative` `gridSlideRef` with geometry mirroring
   Mantine's WeekView defaults; the button fills the cell (full-cell tap target)
   and opens `bottom-start`. Pure binning / chip suppression unchanged.
   `docs/dashboard-views.md` §1.7.1
- 1.247 Double Booking & wizard clash timelines go per-day: a multi-day episode was
   drawn on a single (first-day) axis, so events on later days clamped to a ~15-min
   sliver at the right edge and the axis stretched across the empty span — the timed
   bars became unlabeled squares. New pure `clashDayBuckets` (`clashDisplay.ts`,
   unit-tested) buckets entries by the civil days they cover and drops days carrying
   fewer than two entries; the new shared `ClashTimelineDays` (`clashTimeline.tsx`)
   renders one `ClashTimeline` per clash day behind a `clashDayLabel` subheading
   (capped at five, then `+N more days`), so each day gets a tight axis and full-width
   labels and a multi-day event's all-day band repeats per clash day. Both the Double
   Booking page and the wizard's review-step advisory now render through it
   (`minEntriesPerDay={2}`), and the wizard no longer shows conflict-free covered
   days. `docs/user-clashes.md` §1.8, `docs/event-clashes.md` §1.6

- 1.248 Event-type folders collapse in the wizard type picker: with more than one
  section the type step renders a Mantine `Accordion` (folder name + count badge in the
  control, type badges in the panel) instead of an always-expanded wall of badges; open
  state comes from the new pure `initialExpandedSectionIds` (single section stays open,
  a pre-selected type opens its folder, otherwise all collapsed), a lone section skips
  the accordion and renders inline, and each picker section now carries a stable `id`
  (group id or `UNGROUPED_ID`). No schema change; search intentionally omitted.
  `docs/event-lifecycle.md` §1.10
- 1.249 Deploy updates surface a "New version available — Reload" pill instead of
  silently stale builds: the SW now runs `skipWaiting: false`, so a deploy installs a
  **waiting** worker that leaves the running old build intact; the new
  `SWUpdateNotice` (`AppProviders`, inside `ActionPillProvider`) polls
  `registration.update()` while visible (15 min + `visibilitychange`/`focus`/`online`)
  and shows the shared action pill, posting `SKIP_WAITING` on tap (or after a 30 s
  grace, so an ignored pill still updates), then clearing caches + reloading on
  `controllerchange`. Registration uses `updateViaCache: "none"` and `next.config.ts`
  serves `/serwist/*` `no-cache` so a cached `sw.js` can never hide a deploy. Pure
  `shouldPromptForUpdate` / `SW_UPDATE_CHECK_INTERVAL_MS` / `SW_UPDATE_PROMPT_GRACE_MS`
  (`swRules.ts`, unit-tested). `docs/pwa-offline.md` §1.8/§1.12/§1.13/§1.15/§1.16/§1.17
- 1.250 Event-type groups choose folder vs. inline: `event_type_groups` gains
  `collapsible` (boolean, default `true`, migration `0047`), so an admin can keep a
  group as the collapsed tap-to-expand folder or flip it off to restore the previous
  always-expanded labeled section; the "Ungrouped" catch-all has no group row and is
  always inline. The wizard renders sections in `sort_order`, each as a single-item
  `Accordion` (folder) or a plain labeled `Box` (inline), and the pure
  `initialExpandedSectionIds` now opens only the collapsible folder holding a
  pre-selected type (a lone collapsible folder still starts collapsed). Manage groups
  gains a per-row **Folder** switch (new `setEventTypeGroupCollapsible` action, audited
  as `eventTypeGroup.update`), and the type table marks folder groups with a folder
  icon. `docs/event-lifecycle.md` §1.10, `docs/admin-guide.md` §1.4
- 1.251 Wizard picker puts folders last + roomier group rows: `buildEventTypePickerSections`
  now partitions into non-folder content first (non-collapsible groups in `sort_order`,
  then the "Ungrouped" catch-all) and collapsible folders last, so the collapsed
  sections sit at the bottom; the Manage-groups dialog stays flat by `sort_order` (the
  partition is display-only). Each Manage-groups row is now two lines — group name +
  type count on top, reorder / **Folder** switch / rename / delete below — so the
  controls no longer squeeze the label, and the rename input spans the label line.
  `docs/event-lifecycle.md` §1.10
- 1.252 iOS update-pill loop fix: the deploy pill now detects staleness from a live
  **server version check** (`GET /api/version`, `no-store`, returns `APP_VERSION`) compared
  with the `APP_VERSION` baked into the running page, instead of the service worker's
  `registration.waiting` — iOS Safari left a waiting worker lingering (and still reported)
  after the new build was already running, so the pill reappeared after every tap. On
  apply the client clears the page caches, **unregisters** the worker (so the stuck
  waiting worker is discarded and `SerwistProvider` installs the current build's worker
  cleanly), and reloads. Pure `shouldPromptForUpdate` re-scoped to
  `{ clientVersion, serverVersion, alreadyPrompted }` (`swRules.ts`, unit-tested).
  `docs/pwa-offline.md` §1.8/§1.12/§1.13/§1.15/§1.17
- 1.253 Update-pill loop-proofing + mobile online-reload fix: `shouldPromptForUpdate`
  gains an `appliedVersion` guard persisted in `sessionStorage`
  (`cloudy2.swUpdateApplied`), so a deploy the user already applied is never prompted
  for again — an update loop cannot be visible on any platform (Android was never
  affected: Chrome clears `registration.waiting` correctly; the loop was iOS-only).
  `SerwistProvider` now gets `reloadOnOnline={false}`, removing Serwist's default
  hard-reload on every `online` event (a surprise on flaky mobile connections, and
  redundant with the app's own refresh paths). New `docs/pwa-offline.md` §1.8.1
   documents the iOS-vs-Android behavior and the multi-tab unregister caveat.
- 1.254 iOS standalone bottom-nav detach fix: on iOS 18 installed PWAs the fixed bottom
   nav could sit above the visible bottom on short-content pages (empty space below it),
   because the standalone shell was sized/positioned from the *layout* viewport while the
   visible area is the *visual* viewport. The `AppShellShell` sync now measures
   `window.visualViewport`, exposes `--app-shell-visual-bottom-gap`, listens to
   `visualViewport` `scroll`, and gates its CSS through a JS-added `app-shell-standalone`
   class (so iOS launch paths that miss the `display-mode` query still sync). The footer's
   Chrome edge-to-edge fast path is overridden on iOS/WebKit
   (`@supports (-webkit-touch-callout: none)`) to the plain live-inset box + `bottom: 0`,
   with an explicit `var(…, env(safe-area-inset-bottom))` fallback so an unresolved custom
   property can't collapse `bottom` to `auto`; in standalone the footer re-pins to the
   visual bottom via the measured gap. `docs/pwa-offline.md` §1.19,
   `docs/desktop-responsive.md` §1.2/§1.3
- 1.255 Immediate propagation for admin settings + per-user View edits: admin writes now
   clear the affected `getCachedValue` config keys via the new
   `invalidateConfigCache([...])` (`src/lib/configCache.ts`), so a settings / event-type /
   department / user / template / quick-link edit is visible on the next dashboard read
   instead of after the 60s TTL (per-instance, like the cache itself — other instances
   converge on TTL expiry). Renaming a dashboard View or changing its type is now
   optimistic: `renameDashboardView` / `changeDashboardViewKind` return the updated tab,
   the pure `patchSnapshotTab` patches the held snapshot via the new
   `applyViewTab` context method, so the strip and Manage-views list repaint in the same
   frame before the usual re-read reconciles. `docs/pwa-offline.md` §1.19,
   `docs/events-cache.md` §1.12, `docs/dashboard-views.md` §1.1

- 1.256 Month & Agenda desktop fill: the bounded panes no longer leave a blank
   strip at the bottom. The Agenda card now stretches to the pane (`flex: 1` +
   `agendaViewBody` scroll), so a short day scrolls inside the card instead of
   leaving space below it; the Month grid's six rows grow to fill the pane by
   measuring the pane's scroll box and overriding Mantine's
   `--month-view-max-events` with a fractional value (4-event floor keeps the
   natural height + pane scroll on shorter viewports, chips scale with the row).
   `DualPaneSkeleton` mirrors both fills. `docs/dashboard-views.md` §1.9

- 1.257 Feature Flags + pinned-events indicator variants: a new admin **Settings → Feature
   Flags** tab (last strip slot) built on a small **flag registry**
   (`src/lib/settings/featureFlags.ts`, pure + unit-tested) — each `FeatureFlagDef` maps to
   a typed `settings` column, `getFeatureFlags` resolves every registered flag from the 60s-
   cached singleton row, and a single `updateFeatureFlags` server action validates against
   the closed option set, audits via `diffFields`, invalidates the config cache and
   revalidates; the page renders controls generically from the registry (SegmentedControl +
   Save in the standard form pattern, plus a live mock-pill preview for the ticker flag),
   so a future flag is just a column + an entry. The first flag, `pinnedTickerIndicator`
   (default `classic`), swaps the header pill's `1/N` chip for four org-wide variants that
   free title space (~33–37px): `classic` (inline `1/N` chip), `segmented` (3px bottom
   rotation bar, active segment lit amber, zero in-flow width), `badge` (amber count badge
   on the pill's corner, absolutely positioned), `stacked` (`1/N` over `5d` two-line leading
   block). The `(protected)` layout resolves the flag through the registry and passes it to
   the shell like `bannerConfig`, so a save applies after the next `router.refresh()`; count
   stays in the pill's `aria-label` and all new chrome is `aria-hidden`. New
   `docs/feature-flags.md`; `docs/pinned-events.md` §1.4/§1.6, `docs/user-guide.md` §1.5,
`AGENTS.md` updated (migration: `settings.pinned_ticker_indicator` text NOT NULL default
    `'classic'`, `pnpm db:migrate`)
- 1.258 Zoomed-in grids reclaim the shell's side gutters: the dashboard content
    sat inside the shell's `md` 16px gutters, so once any zoom level pushed a grid
    past the viewport (overflowing into the horizontal pan) those sides became dead
    space. `DashboardView` now derives `reclaimGutter` from the shown view's
    horizontal zoom (> its fit/base level: Month/Dual `monthZoom`, Day/Week (H)
    shared `zoom`, Week (D) `weekMatrixZoom`, Week (Grid) columns
    `gridWeekColZoom`) and flushes the whole content stack flush to the shell edges
    using exactly the same `calc(-1 * var(--app-shell-padding))` the top already used,
    winning back ~16px of visible content per side while zoomed; the chrome, pinned
    strips and grid widen together so alignment holds, and returning to fit restores
    the gutter. Week (Grid)'s default 2× column zoom reclaims immediately; Agenda
    never zoom → never reclaims. `docs/dashboard-views.md` §1.7/§1.8 updated.
- 1.259 Canvas-only gutter bleed + fixed chrome/controls + animated zoom: 1.258
    bled the whole dashboard stack, which moved the tabs/date-nav and jumped the
    canvas at the zoom-1 boundary. The bleed moved to an inner canvas wrapper
    inside the padded `weekBoxRef`, so only the grid (and its pinned strips) goes
    corner-to-corner; the tabs, date-nav, floating zoom/pan controls and fullscreen
    toggle stay put (Week (D)'s controls now anchor to `weekBoxRef` via a new
    `controlsAnchorRef`). The zoom is now eased: the schedule hour-slot width rides
    a registered `--c2-slot` (transitioned via `.c2-zoom-anim`; grid consumes
    `--resources-*-view-slot-width`, rulers `--ruler-slot`), Month/Week (Grid)
    transition `width` (`.c2-zoom-width`), the Week (D) matrix transitions
    `grid-template-columns`/`min-width` (`.c2-zoom-cols`), and the gutter
    `margin-inline` morphs — all under `prefers-reduced-motion: no-preference`. The
    scroll re-anchor is tweened by the new `src/lib/ui/scrollTween.ts`
    (`MOTION.zoom`, house easing) instead of snapping, and `useGridPan` sets
    `overflow-anchor: none` so browser scroll anchoring can't fight it — fixing the
    "flashes the previous zoom" resize artifact. Week (Grid) row zoom stays instant.
    Docs: `dashboard-views.md` §1.7, `grid-pan.md` §1.1.
- 1.260 Zoom recoil fix: 1.259's scroll re-anchor tween used an ease-out cubic while
    the grid's width/slot CSS transitions use `cubic-bezier(0.22, 1, 0.36, 1)`, which
    is much faster early — so on a button zoom the width outran the scroll, drifting
    the anchored column and snapping it back (a recoil right on zoom-in, left on
    zoom-out). `scrollTween.ts` now evaluates the literal house cubic-bezier (new
    `cubicBezier` solver + `zoomEase`), so the tween and the CSS transition share the
    exact same progress curve and the anchor stays put; unit-tested in
    `scrollTween.test.ts`.
- 1.261 Post-save event confirmation variants behind a feature flag: the bespoke
    post-save action pill ("View event") read as a progress/cancel bar next to the
    app's standard toasts, so `savedEventToastVariant` (Settings → Feature Flags,
    default `pill`) now picks one of four presentations: the **classic** two-tone
    pill, a **restyled pill** (new `ActionPill` `variant: "toast"` — light surface,
    green success rail, no sweep fill, single-line copy, nested into the
    notification corners top-center/bottom-right via `.c2-action-pill-host--toast`),
    a **standard toast + "View event"** action (`notifications.show` with an
    embedded compact button, `notifications.hide` on click, stale-closure-safe via
    the captured group id), or a **plain toast**. The SW-update pill stays classic,
    where the sweep is a meaningful auto-apply countdown. The flag rides
    `settings.featureFlags` → `DashboardSharedConfig` → `EventForm`
    (`resolveFlagValue`), so it works from cached offline snapshots; migration
    `settings.saved_event_toast_variant` text NOT NULL default `'pill'`. Docs:
    `action-pill.md` §1.1/§1.3/§1.5, `feature-flags.md`, AGENTS.md.
    (contents in `progress-archive.md` §1.261)
- 1.262 JS-driven zoom animation (fixes the zoom recoil/jumpiness): 1.259–1.260
    animated the grid width via CSS transitions and the scroll re-anchor via a
    separate JS tween — two clocks that drifted (content slid/recoiled), and the
    registered `--c2-slot` custom-property transition didn't run at all in Chrome
    (the schedule columns snapped). Replaced with **one** rAF loop
    (`src/lib/ui/zoomAnim.ts`, new; `scrollTween.ts` removed) that writes both the
    zoom-derived width/slot and the scroll from the same interpolated value. React
    publishes the active view's multiplier as `--c2-zoom` (+ `--c2-slot-base`) on
    the canvas wrapper; every zoomed width/slot derives from
    `var(--c2-zoom-anim, var(--c2-zoom))` — Month inner + weekday strip, Week (Grid)
    rows, the schedule slot + ruler, and the Week (D) matrix template/min-width.
    `animateZoom` writes `--c2-zoom-anim` and the anchored scroll each frame, then
    clears the override; motion collapses under `prefers-reduced-motion`/`c2-low-end`.
    Removed the `.c2-zoom-*` transitions and `@property --c2-slot`; the gutter
    `margin-inline` still animates via `.c2-gutter-anim`. Docs: `dashboard-views.md`
    §1.7, `grid-pan.md` §1.1.
- 1.263 Zoom-out-to-fit jump fix: 1.262's re-anchor used the zoom ratio and
    `reanchorScrollLeft`, which assumes a **constant viewport width**. On the last
    step (back to 100%) the canvas un-bleeds, so the inner wrapper's `margin-inline`
    morphs `-16px → 0` and the ScrollArea viewport narrows ~32px mid-animation;
    for the percentage-width views the content shrinks with the wrapper too. On
    zoom-out the ratio-based target exceeded the shrunken `maxScroll`, so the
    browser clamped `scrollLeft` → a jump (zoom-in was conservative, hence the
    asymmetry). New `scrollAnchorTracker` (`zoomAnim.ts`) captures the
    time-content point under the anchor at the start zoom and re-centres it each
    frame from the **measured** `viewport.scrollWidth` and the **current** viewport
    width, clamped to the real max — correct for percentage and rem widths and
    across the viewport resize. `animateZoom` now calls `apply(from)` + `onStart()`
    before snapping/animating so the capture sees the old geometry. Wired the five
    re-anchor sites (schedule, Month, Week (Grid) col, dual-pane month, matrix).
    Docs: `dashboard-views.md` §1.7.
- 1.264 Animate the vertical (Week (Grid) row) zoom: it previously snapped while
    every horizontal zoom eased. The row height is Mantine's
    `--week-view-slot-height`, set from the `slotHeight` prop; event positions are
    percentage-based and the library never reads `slotHeight` numerically, so the
    prop now carries `calc(3.5rem * var(--mantine-scale) * ROW_ZOOM_VAR)` and the
    multiplier rides `--c2-row-zoom` / `--c2-row-zoom-anim` on the canvas wrapper —
    `animateZoom` drives it per frame with **no re-render**. Generalized
    `scrollAnchorTracker` to either axis (`axis`/`label`/`focal`); the vertical
    re-anchor measures the content and current viewport (the `maxHeight`-bounded
    ScrollArea shrinks at low row zoom) and subtracts the sticky day-header +
    all-day offset (which doesn't scale). `animateZoom` gained `overrideVar` and a
    per-`(element,var)` in-flight registry so the column and row axes can animate
    the same wrapper concurrently. Removed the now-dead `reanchorScrollLeft` /
    `reanchorScrollTop` helpers (+ tests). Docs: `dashboard-views.md` §1.7,
    `grid-pan.md` §1.1.
- 1.265 Month & Agenda agenda swipe fix (touch): the pane's day swipe stopped
    working on touch once the card began scrolling internally — `agendaViewBody`
    is a scroll container nested inside the swipe container, and the browser
    intersects `touch-action` only up to the **first containing scrolling
    element**, so the outer container's `pan-y` was never consulted; the browser
    claimed the horizontal pan, fired `pointercancel` and `useDrag` dropped the
    gesture. Both the AgendaView root (`overflow: hidden`) and `agendaViewBody`
    now set `touch-action: pan-y`, keeping the vertical scroll native while the
    app owns horizontal. The Agenda tab and day modal have no nested scroller, so
    they were unaffected. Docs: `dashboard-views.md` §1.9.
- 1.266 Pinned-events indicator `split` variant: the `1/N` position counter and
    the `5d` countdown now merge into one **two-tone leading pill** — amber left
    half (counter, `accent-6` on `brand-9`) + blue right half (`brand-6` on
    white) countdown, content-sized and joined with `overflow: hidden` (each half
    keeps a 7px outer cap but only a 4px inner seam, so the two read as one tight
    token; the variant also halves the pill's token→title gap, 8px → 4px) — as a
    fifth `pinnedTickerIndicator` option ("Split pill", Settings →
    Feature Flags; default stays `classic`; no schema change — the option set is
    code-side). Renders in the ticker and the Feature Flags live preview; the
    standalone countdown chip is omitted for it (like `stacked`). Docs:
    `pinned-events.md` §1.4, `feature-flags.md` §1.5, `user-guide.md` §1.5.
- 1.267 Mobile view menu + natural month grid. Below `lg` the dashboard's
    view-tab strip row (tabs, `+` Add-view, All-views chevron, Manage-views gear)
    is dropped to save a full row of sticky chrome; the date-nav row gains one
    compact 36px four-squares (`IconLayoutGrid`) view-menu button at its right
    edge, beside the date selector, whose
    dropdown lists every tab plus **Add view** / **Manage views** (icon-only
    trigger; active name in `aria-label`/tooltip). The Month grid also stops
    Mantine's `consistentWeeks` padding (`consistentWeeks={false}` on both the
    Month and Month & Agenda `MonthView`s): it renders the month's natural 4–6
    rows, never a full trailing week pulled from the next month, and
    `monthGridRows`/`monthGridMonths` (skeleton rows + range read) plus the
    Dual-Pane fill math now follow that count. Docs: `dashboard-views.md` §1.1,
    `desktop-responsive.md`, `events-cache.md` §1.4.1, `immersive-mode.md` §1.4,
    `loading-transitions.md` §1.13.2, `user-guide.md` §1.3.1.
- 1.268 Month weekday strip whitespace fix. The pinned weekday strip was a fixed
    36px box (`2.25rem`) while its height-less inner zoom track only occupied the
    ~22px text line, wasting ~14px before the grid; and the page `Stack`'s
    `gap="sm"` left another 12px above it at rest (which the sticky strip
    swallowed on scroll, so the gap appeared only at the top of the page). The
    strip now hugs its labels (`height: auto` + 2px `paddingBlock`) and the
    month view's grid wrapper cancels the page gap
    (`marginTop: calc(-1 * var(--mantine-spacing-sm))` when `shownView ===
    "month"`), so it docks flush under the chrome at rest and on scroll with no
    jump. Docs: `desktop-responsive.md`.
- 1.269 KAH fixes: the KAH Status nav entry now carries the shared amber
    active-breach count badge (groups breaching today — all groups for admins,
    the viewer's own for members) fed by a new read-only `checkKahBreaches`
    server action (`src/lib/kah/statusActions.ts`), fetched on mount/refocus and
    after event changes like Double Booking; and the KAH day scan no longer
    spills a one-day all-day event into the next UTC+8 day —
    `overseasEventsInRange` now reads each overseas event's effective occupancy
    via the clash engine's `effectiveEventWindow` (all-day UTC-midnight bounds
    realigned to the SGT civil day, half-day AM/PM honored) and
    `busyDaysInRange` uses half-open boundaries, with the breach email/audit
    `{window}` showing the inclusive all-day end. Docs: `kah.md`
    §1.1/§1.5.1/§1.7/§1.8.
- 1.270 KAH nav badge looks forward 30 days: `checkKahBreaches`
    (`src/lib/kah/statusActions.ts`) no longer counts only groups breaching
    *today* (which left the badge empty whenever breaches were only upcoming,
    unlike Double Booking's 30-day scan) — it now runs the `/kah-status` page's
    own per-day math over `[today, today + KAH_BADGE_LOOKAHEAD_DAYS)` via
    `overseasEventsInRange` → `busyDaysInRange` → `kahStatusForWindow` and counts
    distinct groups with any breached day (new pure, unit-tested
    `breachedGroupCount` in `src/lib/kah/status.ts`). Docs: `kah.md` §1.7/§1.8,
    `loading-transitions.md` §1.13.1.
- 1.271 KAH breach cards: each `/kah-status` breach period now renders as a
    collapsible clash-style `ClashCard` (reusing the Double Booking card/row
    components) — the always-visible summary lists the group's **full active
    roster** (away in red, in-country muted, "You" emphasised) with an
    away/in-country count and the Active/Upcoming/Resolved status, and the
    expanded body lists the **overseas events that took those members away**
    (cross-calendar copies collapsed by the new pure
    `dedupeOverseasEventsByGroupId`), each opening the shared read-only
    `EventDetail` in place via the new read-only `getKahBreachEventDetail`
    action (admin, or a member of an affected group; the copy is re-verified
    against the enriched read). The KAH read gained
    `overseasEventEntriesInRange` (`KahBreachEvent` with type/title/color/
    calendar/windows) while `overseasEventsInRange` stays lean for notify; new
    pure `eventsForGroupEpisode` + `memberIdsAwayOnEvent` are unit-tested.
    `conflictWindowNaive` (clashDisplay) and `shapeClashDetail` (new
    `events/clashDetail.ts`) are now shared with the clash reports. Docs:
    `kah.md` §1.7/§1.8,     `user-clashes.md` §1.8, guides.
- 1.272 KAH look-ahead & badge fix: the nav badge now counts breach **periods**
    (maximal runs) over the forward window from today through the end of the
    month 3 months ahead (the page's default) — admins combined across all
    groups, members their own — instead of distinct groups over a bare 30-day
    window, so a resolved/past or >30-day breach no longer leaves it hidden. The
    `/kah-status` page is now **forward-only** (no past half) with a **Look
    ahead** dropdown (3 months default / 6 months / 1 year) that is per-view only
    — never saved, so a refresh resets it. `checkKahBreaches` and the page share
    one builder (`buildKahStatusViewData` in new `src/lib/kah/viewData.ts`, with
    the pure client-safe `src/lib/kah/range.ts` helpers); the new
    `getKahStatusView` action serves range changes, and `Resolved` can no longer
    occur. Docs: `kah.md` §1.7/§1.8/§1.9, `loading-transitions.md` §1.13.1.
- 1.273 Parade-state email cron fix + hardening: the Cloud Scheduler job was created with
    gcloud's default HTTP method (POST) while the route exported only GET, so every scheduled
    tick 405'd and Cloud Scheduler recorded `status.code` 2 (UNKNOWN) while a manual GET
    succeeded — the route now exports GET and POST (GET canonical,
    `src/app/api/cron/parade-state-email/route.ts`). `runParadeStateEmail` now audits every
    non-test attempt (`paradeState.emailSend`) with a flat `outcome`
    (`sent`/`failed`/`skipped`) plus a `reason`
    (`disabled`/`no-recipients`/`already-sent`/`no-emails`) or the swallowed `error`, and
    returns that reason/error in its result so a silent no-op is diagnosable;
    `saveParadeEmailSettings` now calls `invalidateConfigCache(["settings"])` like every
    sibling settings action (a just-enabled config no longer serves stale `disabled` for up
    to 60 s). Docs: `parade-state-email.md` §1.1/§1.4/§1.5, `developer-guide.md` §1.9.1,
    `AGENTS.md`.
- 1.274 Mobile period chevrons move to the thumb zone. Below `lg` the dashboard
    nav row's prev/next `<` `>` leave the sticky top row (`visibleFrom="lg"` on
    the desktop row) and join the bottom-right FAB cluster
    (`[<] [>] [LINK] [CREATE]`) beside the Quick-links / New-event FABs as 44px
    circular frosted-glass controls (`.c2-glass-fab` + amber/brand tints); the
    whole mobile cluster is glass, every other page's FABs stay solid. The top
    row keeps the period label, filter, date and view-menu; both sets call one
    shared view-aware `navigatePeriod(±1)` and read their accessible name from
    `periodStepLabel`, so behaviour and the existing live-region announcements
    are unchanged. Also fixes the pre-existing `react-hooks/refs` lint error by
    capturing the modal viewport size on open (`captureModalViewport`) instead
    of reading a ref during render. Docs: `dashboard-views.md` §1.1,
    `desktop-responsive.md`, `immersive-mode.md` §1.4, `accessibility.md` §1.2,
    `AGENTS.md`.
- 1.275 Adjustable glass-FAB opacity: the Calendar mobile bottom button cluster's
    frosted-glass transparency is now a feature flag, `glassFabLevel`
    (subtle / medium / strong; medium = the shipped look) — new
    `settings.glass_fab_level` column (migration 0050) + one registry entry, so
    Settings → Feature Flags auto-renders the control (with a live four-button
    preview over a two-tone checker). The alphas moved into `.c2-glass-fab`
    `--c2g-*` CSS vars consumed by the visual rules (accent/brand hover + active
    derive with `calc()`), and the level applies as a `c2-glass-fab--<level>`
    modifier on the cluster. Resolved into `DashboardSharedConfig` →
    `DashboardView`; `DASHBOARD_SNAPSHOT_VERSION` bumped 1 → 2 so stale device
    snapshots are dropped. Docs: `feature-flags.md`, `dashboard-views.md` §1.1,
    `AGENTS.md`.
- 1.276 Drag-to-reorder on every manageable list: a new `reorderDrag` feature flag
    (Settings → Feature Flags, default `arrows`) adds a dnd-kit drag handle beside the
    existing ↑/↓ chevrons (kept as the a11y fallback) across dashboard views, event-type
    groups, departments, quick links and title-recipe segments. New
    `settings.reorder_drag` column (migration 0051) + one registry entry; shared
    `SortableList`/`SortableRow`/`DragHandle` (`@dnd-kit/react`) and a `moveTo(id, toIndex)`
    path in `useReorderRows`; server-backed drag persists a whole-list
    `reorderX(orderedIds, movedId?)` (transaction renumber) — `reorderQuickLinks`,
    `reorderEventTypeGroups`, `reorderDepartments`; departments drag sibling-only via
    `moveToSiblingIndex`. Resolved into `DashboardSharedConfig.reorderDrag` and the
    settings pages; `DASHBOARD_SNAPSHOT_VERSION` bumped 2 → 3. Docs: new `reorder.md`,
    `feature-flags.md`, `accessibility.md`, `dashboard-views.md`, `quick-links.md`,
    `roster-sharing.md`, `event-lifecycle.md`, `AGENTS.md`.
- 1.277 Drag-only default for reorder: the `reorderDrag` flag gains a third option
    and a new default — `drag` (handle only), `arrowsDrag` (chevrons + handle),
    `arrows` (chevrons only). `settings.reorder_drag` default changed to `'drag'`
    (migration 0051 edited in place, since it was uncommitted); the leaf surfaces
    now take the resolved mode and derive two booleans via `isReorderDragEnabled`
    (handle) / `isReorderArrowsEnabled` (chevrons), rendering the chevrons
    conditionally. `DASHBOARD_SNAPSHOT_VERSION` bumped 3 → 4. In `drag` mode the
    non-mouse path is dnd-kit's KeyboardSensor bound to the grip (Space/Enter +
    arrows); `arrowsDrag` stays available for strict WCAG 2.5.7. Docs:
    `reorder.md`, `feature-flags.md`, `accessibility.md`, `AGENTS.md`.
- 1.278 Fuse.js fuzzy search across the app's client text-search surfaces: new
    `search/fuzzy.ts` (threshold 0.22, `ignoreLocation`, field-norm on, exact
    substring for identifier fields) wired into the user/department pickers
    (`userSelect.ts` — upgrades UserSelectModal, filters, invitees),
    Contacts (`contacts/filter.ts`), and the Users table. Event search is
    reworked to read the month cache (`readCalendarRange` →
    `projectRangeEvents`), trim to the exact window (`eventWithinRange`) and
    fuzzy-rank title/location/type/calendar (`filterRangeForSearch`), replacing
    the per-calendar Google `q` fan-out; its modal now renders a flat
    relevance-ordered list instead of `AgendaView`. Docs: `event-search.md`,
    `user-picker.md`.
- 1.279 App-wide frosted glass: the `glassFabLevel` flag is broadened into one global
    `translucencyLevel` (subtle / medium / strong) governing every surface that overlaps
    content — the navy header, sticky calendar chrome + its inline buttons, the pinned grid
    headers, bottom nav, settings tab strip, desktop sidebar, floating zoom/pan + fullscreen
    controls and every FAB, menus, popovers, modals and tooltips. The column is renamed
    `settings.glass_fab_level` → `settings.translucency_level` (migration 0052) and the shell
    publishes the level on `<html>` as `data-c2-glass`, consumed by the generalized
    `--c2g-*` / `--c2-glass-*` tokens and the `.c2-glass-surface` / `-header` / `-fab` /
    `-btn` classes. Sticky-left label columns stay opaque for legibility, and low-end devices
    (`c2-low-end`) fall back to tint-only. `DASHBOARD_SNAPSHOT_VERSION` bumped 4 → 5 so a
    stale device snapshot (carrying the old field name) is dropped. Docs: `feature-flags.md`,
    `dashboard-views.md` §1.1, `desktop-responsive.md`, `AGENTS.md`.
- 1.280 Translucency theme fix: the composite `--c2-glass-bg` / `--c2-glass-header-bg`
    tokens no longer use `light-dark()` inside a custom property (which resolved to the
    light branch even in dark mode, rendering the sticky chrome / grid headers / bottom nav
    light over a dark body). Scheme-specific values are now scoped with
    `[data-mantine-color-scheme="dark"]`, and the low-end tint-only override matches. Also
    re-applies `c2-glass-fab` to the two mobile period-chevron `ActionIcon`s (dropped during
    the class rename, so they rendered as plain `variant="default"`).
- 1.281 Translucency polish: the dashboard sticky chrome now bleeds its frosted
    background corner-to-corner (negative `margin-inline` + matching `padding-inline` on the
    shell padding var) so grid content scrolling beneath is masked at the sides, with the
    tab/date-nav controls unmoved. `.c2-glass-btn` gets an explicit scheme-aware icon colour
    so the zoom/fullscreen controls (Mantine `variant="filled"`) are visible in light mode.
    Overlays are now opaque: the theme-level glass on Modal/Menu/Popover/Tooltip is removed,
    along with the glass modal scrim, frosted tooltip, Mantine notification card and the
    action-pill toast — glass stays on page-level surfaces only.
- 1.282 Frosted button shadows: `.c2-glass-btn` gains `box-shadow: var(--mantine-shadow-md)`
    (matching the round FABs), so the date-nav / filter / date / view-menu buttons, the
    New-event and Quick-links buttons, and the floating zoom/pan/fullscreen controls lift off
    the frosted chrome instead of blending into it.

## 1.4 Open items & next steps

1. **`ADMIN_INITIAL_PASSWORD` + `ADMIN_PIN`** must be set on Vercel (Production +
   Preview), the Cloud Run shadow's GH secret mirrors, and `.env.local` — both seed
   their hash on first login and reconcile on every login afterwards (rotating = change
   the env var + redeploy). Named admins can't sign in until `ADMIN_PIN` is set.
2. **Breach email transport**: configure either Workspace domain-wide delegation
   (`gmail.send` scope for `GOOGLE_DELEGATE_EMAIL`) or the SMTP fallback (`SMTP_URL`,
   e.g. a personal Gmail app password) — without one, breaches stay audit-only.
3. Carried-over Phase-0 scope to re-confirm as still wanted: acronym glossary surfaced
   on event titles, VCF contacts export, masquerade permissions beyond "on behalf of".
4. Per-phase manual-QA debts recorded in the archive's verification notes (PWA device
   installs, on-device swipe checks, width sweeps) were never systematically cleared.
5. **Event participant push** needs the VAPID trio set per surface
   (Vercel Production/Preview, Cloud Run shadow GH secrets, `.env.local`) — generate
   once with `npx web-push generate-vapid-keys` and share the same pair; iOS users
   must run iOS/iPadOS 16.4+ from the **installed** home-screen app (remove + re-add
   once if added before 16.4) and tap Enable in Profile → Notifications.

## 1.5 Deployment & environments

- Three tiers from one codebase — **Local** (`pnpm dev` with `.env.local`), **Dev**
  (Vercel Preview branch, isolated dev Neon + dev Google), **Prod** (Vercel
  Production + Cloud Run shadow `cloudy2` sharing prod Neon + prod Google). Full
  matrix: `docs/developer-guide.md` §1.9; Cloud Run details in §1.9.1.
- Vercel auto-builds: `main` → production, `dev` → preview, with **fully isolated
  environments** — separate Neon account (dev DB is migrations-only; `db:seed` never
  fabricates calendars — it only defaults the user login keyword, so it is safe to
  run; departments/users are created in-app so dev gets its own calendars) and
  separate Google account (dev service account).
- Migrations auto-apply per environment via CI: `main` push → prod DB
  (`DATABASE_URL` secret) then `deploy-cloudrun` ships the Cloud Run shadow; `dev`
  push → dev DB (`DATABASE_URL_PREVIEW` secret).
- Env vars are set per environment: the Vercel Production/Preview table is in
  `docs/developer-guide.md` §1.9; the Cloud Run shadow mirrors Production and sets
  `NEXTAUTH_URL` to its `*.run.app` URL (§1.9.1). Leave `NEXTAUTH_URL` unset on
  Vercel; set `ENABLE_EXPERIMENTAL_COREPACK = 1`. Canonical gotchas live in AGENTS.md.
