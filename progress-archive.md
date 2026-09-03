# 1. Cloudy2 — Progress Archive

Internal tool for managing company personnel, leave/event records, and Key Appointment
Holder (KAH) constraints, with Google Calendar as the event/visibility layer.

> **Archive note (2026-08).** This file preserves the detailed per-phase history through
> Phase 3al exactly as it stood when [progress.md](progress.md) was slimmed to a
> current-state summary. Section numbers are preserved verbatim — including the duplicate
> `1.28` entries and the gap at `1.70` — so existing `see §…` cross-references stay
> valid. New phases append a one-line summary to progress.md §1.3 and their full notes here.

## Table of contents

- [1.1 Status](#11-status)
- [1.2 Decisions locked in (Phase 0)](#12-decisions-locked-in-phase-0)
- [1.3 Implemented (Phase 1)](#13-implemented-phase-1)
  - [1.3.1 Tooling](#131-tooling)
  - [1.3.2 Database schema](#132-database-schema-srcdbschematics)
  - [1.3.3 Auth & routing](#133-auth-routing)
  - [1.3.4 Google integration (stub)](#134-google-integration-stub)
  - [1.3.5 Tests](#135-tests)
- [1.4 Verification status](#14-verification-status)
- [1.5 Deployment (Vercel) — current blocker & fix](#15-deployment-vercel-current-blocker-fix)
  - [1.5.1 Remaining manual steps (Vercel dashboard)](#151-remaining-manual-steps-vercel-dashboard)
- [1.6 CI migrations (Phase 1.5)](#16-ci-migrations-phase-15)
- [1.7 Bootstrap & schema hardening (Phase 1.5)](#17-bootstrap-schema-hardening-phase-15)
- [1.8 Roster & Departments (Phase 2a)](#18-roster-departments-phase-2a)
- [1.9 Seeding (Phase 2b)](#19-seeding-phase-2b)
- [1.10 Next.js 16 upgrade & auth fix (Phase 2c)](#110-nextjs-16-upgrade-auth-fix-phase-2c)
- [1.11 Departments as Google Calendars + sharing + audit (Phase 2d)](#111-departments-as-google-calendars--sharing--audit-phase-2d)
- [1.12 Mobile-only UI refactor and Users rename (Phase 2e)](#112-mobile-only-ui-refactor-and-users-rename-phase-2e)
- [1.13 Admin Settings hub and login keyword (Phase 2f)](#113-admin-settings-hub-and-login-keyword-phase-2f)
- [1.14 Event Types (Phase 2g)](#114-event-types-phase-2g)
- [1.15 Next steps (Phase 2+)](#115-next-steps-phase-2)
- [1.16 Calendar events (Phase 2h)](#116-calendar-events-phase-2h)
- [1.17 Dashboard mobile month view (Phase 2i)](#117-dashboard-mobile-month-view-phase-2i)
- [1.18 Agenda day swipe (Phase 2j)](#118-agenda-day-swipe-phase-2j)
- [1.19 Schedule view & event invitees (Phase 2k)](#119-schedule-view--event-invitees-phase-2k)
- [1.20 Cross-department event copies (Phase 2l)](#120-cross-department-event-copies-phase-2l)
- [1.21 User shortname (Phase 2m)](#121-user-shortname-phase-2m)
- [1.22 Display name template (Phase 2n)](#122-display-name-template-phase-2n)
- [1.23 Event title template (Phase 2o)](#123-event-title-template-phase-2o)
- [1.24 Event type acronym + Templates tab (Phase 2p)](#124-event-type-acronym--templates-tab-phase-2p)
- [1.25 Schedule view space optimization (Phase 2q)](#125-schedule-view-space-optimization-phase-2q)
- [1.26 Git history](#126-git-history)
- [1.27 Event time options + calendar preview (Phase 2r)](#127-event-time-options--calendar-preview-phase-2r)
- [1.28 Calendar user filter (Phase 2s)](#128-calendar-user-filter-phase-2s)
- [1.28 Admin events on behalf of another user (Phase 2s)](#128-admin-events-on-behalf-of-another-user-phase-2s)
- [1.29 Admin-id UUID guard fix](#129-admin-id-uuid-guard-fix)
- [1.30 Empty event title (Phase 2t)](#130-empty-event-title-phase-2t)
- [1.31 Google Calendar "Edit in app" link (Phase 2u)](#131-google-calendar-edit-in-app-link-phase-2u)
- [1.32 Compressed opaque notes block (Phase 2v)](#132-compressed-opaque-notes-block-phase-2v)
- [1.33 Searchable user filter (Phase 2w)](#133-searchable-user-filter-phase-2w)
- [1.34 PWA installability (Phase 3a)](#134-pwa-installability-phase-3a)
- [1.35 Touch-friendly input heights (Phase 3b)](#135-touch-friendly-input-heights-phase-3b)
- [1.36 Global bottom nav + Overview page (Phase 3c)](#136-global-bottom-nav--overview-page-phase-3c)
- [1.37 Overview cross-department filter fix (Phase 3d)](#137-overview-cross-department-filter-fix-phase-3d)
- [1.38 Cross-department user options in filter dialogs (Phase 3d)](#138-cross-department-user-options-in-filter-dialogs-phase-3d)
- [1.39 Overview full-selection row scoping fix (Phase 3d)](#139-overview-full-selection-row-scoping-fix-phase-3d)
- [1.40 Externally created events (Phase 3e)](#140-externally-created-events-phase-3e)
- [1.41 Additional access levels (Phase 3f)](#141-additional-access-levels-phase-3f)
- [1.42 Calendar caching layer (Phase 3g)](#142-calendar-caching-layer-phase-3g)
- [1.43 Calendar force refresh (Phase 3h)](#143-calendar-force-refresh-phase-3h)
- [1.44 Schedule week view + S. Month removal (Phase 3i)](#144-schedule-week-view--s-month-removal-phase-3i)
- [1.45 Pinned Week-view day label (Phase 3j)](#145-pinned-week-view-day-label-phase-3j)
- [1.46 Out of Camp + location + location policy (Phase 3k)](#146-out-of-camp--location--location-policy-phase-3k)
- [1.47 Staged event form wizard (Phase 3l)](#147-staged-event-form-wizard-phase-3l)
- [1.48 Pinned "On behalf of" select for admins (Phase 3l)](#148-pinned-on-behalf-of-select-for-admins-phase-3l)
- [1.49 Dashboard toolbar kebab overflow menu (Phase 3m)](#149-dashboard-toolbar-kebab-overflow-menu-phase-3m)
- [1.50 Icon-only circular FABs (Phase 3n)](#150-icon-only-circular-fabs-phase-3n)
- [1.51 Bigger FABs + download icon optical centering (Phase 3o)](#151-bigger-fabs--download-icon-optical-centering-phase-3o)
- [1.52 Stale-while-navigating dashboard grid (Phase 3p)](#152-stale-while-navigating-dashboard-grid-phase-3p)
- [1.53 Dashboard grid cold-load reveal (Phase 3p)](#153-dashboard-grid-cold-load-reveal-phase-3p)
- [1.54 Day-view date picker: MobileMonthView replaces mini calendar (Phase 3q)](#154-day-view-date-picker-mobilemonthview-replaces-mini-calendar-phase-3q)
- [1.55 Parade State filter row scoping + Event Types removal (Phase 3r)](#155-parade-state-filter-row-scoping--event-types-removal-phase-3r)
- [1.56 No-keyboard dropdowns (Phase 3s)](#156-no-keyboard-dropdowns-phase-3s)
- [1.57 Audit log viewer + retention + export (Phase 3t)](#157-audit-log-viewer--retention--export-phase-3t)
- [1.58 Dashboard loading: skeleton only, fade-in on swap (Phase 3u)](#158-dashboard-loading-skeleton-only-fade-in-on-swap-phase-3u)
- [1.59 Standard loading appearance across the app (Phase 3u)](#159-standard-loading-appearance-across-the-app-phase-3u)
- [1.60 Event form: stop Enter submitting the draft (Phase 3v)](#160-event-form-stop-enter-submitting-the-draft-phase-3v)
- [1.61 Email change syncs Google Calendar access (bugfix)](#161-email-change-syncs-google-calendar-access-bugfix)
- [1.62 Department selects without type-to-filter search](#162-department-selects-without-type-to-filter-search)
- [1.63 Dashboard Agenda view (Phase 3w)](#163-dashboard-agenda-view-phase-3w)
- [1.64 Agenda day slide-in + create-event button (Phase 3x)](#164-agenda-day-slide-in--create-event-button-phase-3x)
- [1.65 Agenda-tab day swipe + slide (Phase 3y)](#165-agenda-tab-day-swipe--slide-phase-3y)
- [1.66 Week v2 matrix view (Phase 3z)](#166-week-v2-matrix-view-phase-3z)
- [1.67 Filter quick actions in the 3-dot menus (Phase 3aa)](#167-filter-quick-actions-in-the-3-dot-menus-phase-3aa)
- [1.68 Event location polarity fix (bugfix)](#168-event-location-polarity-fix-bugfix)
- [1.69 Remembered UI state across relaunch (Phase 3ab)](#169-remembered-ui-state-across-relaunch-phase-3ab)
- [1.71 User filter narrows the resource rows (bugfix)](#171-user-filter-narrows-the-resource-rows-bugfix)
- [1.72 Pinned dashboard view tabs (Phase 3ac)](#172-pinned-dashboard-view-tabs-phase-3ac)
- [1.73 Legible audit log details (Phase 3ad)](#173-legible-audit-log-details-phase-3ad)
- [1.74 Week v2 event chips + dark-mode tab indicator (Phase 3ae)](#174-week-v2-event-chips--dark-mode-tab-indicator-phase-3ae)
- [1.75 Tap-to-show tooltips for user shortnames (Phase 3af)](#175-tap-to-show-tooltips-for-user-shortnames-phase-3af)
- [1.76 Documentation deep-dives (Phase 3ag)](#176-documentation-deep-dives-phase-3ag)
- [1.77 Desktop responsive layout (Phase 3ah)](#177-desktop-responsive-layout-phase-3ah)
- [1.78 Desktop layout review fixes (Phase 3ai)](#178-desktop-layout-review-fixes-phase-3ai)
- [1.79 Desktop responsive bugfixes (Phase 3aj)](#179-desktop-responsive-bugfixes-phase-3aj)
- [1.80 Event form wizard: review step, relocated "On behalf of", optional creator (Phase 3ak)](#180-event-form-wizard-review-step-relocated-on-behalf-of-optional-creator-phase-3ak)
- [1.81 Collapsible sidebar rail (Phase 3al)](#181-collapsible-sidebar-rail-phase-3al)
- [1.82 Settings list pages: full-size desktop create buttons (Phase 3am)](#182-settings-list-pages-full-size-desktop-create-buttons-phase-3am)
- [1.83 Mobile FAB: portaled Affix + :root offset vars (bugfix)](#183-mobile-fab-ported-affix--root-offset-vars-bugfix)
- [1.84 Full Day / Half Day time-option split (Phase 3an)](#184-full-day--half-day-time-option-split-phase-3an)
- [1.85 Parade State attendance-taking mode (Phase 3ao)](#185-parade-state-attendance-taking-mode-phase-3ao)
- [1.86 Calendar skeleton consistency pass (bugfix)](#186-calendar-skeleton-consistency-pass-bugfix)
- [1.87 Event webhooks to external systems (Phase 3ap)](#187-event-webhooks-to-external-systems-phase-3ap)
- [1.88 Multiple webhook endpoints + in-app payload guide (Phase 3aq)](#188-multiple-webhook-endpoints--in-app-payload-guide-phase-3aq)
- [1.89 Attendance report: present wins, no event tags (Phase 3ar)](#189-attendance-report-present-wins-no-event-tags-phase-3ar)
- [1.90 Branded error, 404 & offline fallbacks](#190-branded-error--404--offline-fallbacks)
- [1.91 Mobile correctness: safe areas, toast placement, skeleton fidelity](#191-mobile-correctness-safe-areas-toast-placement-skeleton-fidelity)
- [1.92 Interaction consistency: confirms, chips, export scope, login errors](#192-interaction-consistency-confirms-chips-export-scope-login-errors)
- [1.93 Accessibility pass: keyboard reachability, pressed states, parade legend](#193-accessibility-pass-keyboard-reachability-pressed-states-parade-legend)
- [1.94 Not-found prerender fix (bugfix)](#194-not-found-prerender-fix-bugfix)
- [1.95 Department event colors (Phase 3as)](#195-department-event-colors-phase-3as)
- [1.96 Event-type event colors (Phase 3at)](#196-event-type-event-colors-phase-3at)
- [1.97 Sticky dashboard chrome & pinned view headers (Phase 3au)](#197-sticky-dashboard-chrome--pinned-view-headers-phase-3au)
- [1.98 Pinned time rulers, compact chrome, overlap fix (Phase 3av)](#198-pinned-time-rulers-compact-chrome-overlap-fix-phase-3av)
- [1.99 Owner hidden from invited-attendee lists; "Invited Attendees" rename (Phase 3aw)](#199-owner-hidden-from-invited-attendee-lists-invited-attendees-rename-phase-3aw)
- [1.100 Form validation feedback: toast + scroll-to-error + validate-on-blur](#1100-form-validation-feedback-toast--scroll-to-error--validate-on-blur)
- [1.101 Duplicate-key crashes fixed: drizzle-wrapped error inspection](#1101-duplicate-key-crashes-fixed-drizzle-wrapped-error-inspection)
- [1.102 Slow-network responsiveness: optimistic chrome + client-router reuse](#1102-slow-network-responsiveness-optimistic-chrome--client-router-reuse)
- [1.103 Quick links: admin-managed link menu launched from the Calendar FAB (Phase 3ay)](#1103-quick-links-admin-managed-link-menu-launched-from-the-calendar-fab-phase-3ay)
- [1.104 Fullscreen calendar view (Phase 3az)](#1104-fullscreen-calendar-view-phase-3az)
- [1.105 Event invitee picker: cross-department invites for non-admins (Phase 3b0)](#1105-event-invitee-picker-cross-department-invites-for-non-admins-phase-3b0)
- [1.106 UserSelectModal: badge picker dialog replaces the user multi-selects (Phase 3b1)](#1106-userselectmodal-badge-picker-dialog-replaces-the-user-multi-selects-phase-3b1)
- [1.107 UserSelectModal: fixed-height picker dialog (bugfix)](#1107-userselectmodal-fixed-height-picker-dialog-bugfix)
- [1.108 UserSelectModal: badge taps keep the search focus (bugfix)](#1108-userselectmodal-badge-taps-keep-the-search-focus-bugfix)
- [1.111 Month view hides adjacent-month days (bugfix)](#1111-month-view-hides-adjacent-month-days-bugfix)
- [1.112 Month view range-reads its 6-week grid; adjacent-month days show their events (supersedes 1.111)](#1112-month-view-range-reads-its-6-week-grid-adjacent-month-days-show-their-events-supersedes-1111)
- [1.118 Departments settings: unified detail modal + assigned-user role overrides](#1118-departments-settings-unified-detail-modal--assigned-user-role-overrides)
- [1.119 Event wizard modal: outside clicks and Escape minimize instead of discarding](#1119-event-wizard-modal-outside-clicks-and-escape-minimize-instead-of-discarding)
- [1.123 SW build-update takeover: build-versioned page caches + controllerchange reload (bugfix)](#1123-sw-build-update-takeover-build-versioned-page-caches--controllerchange-reload-bugfix)
- [1.124 Offline fallback: last-saved view + saved-views picker (Phase 3b4)](#1124-offline-fallback-last-saved-view--saved-views-picker-phase-3b4)
- [1.125 Offline fallback reachability fix (bugfix for 1.124)](#1125-offline-fallback-reachability-fix-bugfix-for-1124)
- [1.126 Offline UX: last saved view for every offline navigation; offline.html drops the picker (Phase 3b4)](#1126-offline-ux-last-saved-view-for-every-offline-navigation-offlinehtml-drops-the-picker-phase-3b4)
- [1.131 Department hierarchy (Phase 3b6)](#1131-department-hierarchy-phase-3b6)
- [1.138 Day/Week (H) timeline zoom (Phase 3b7)](#1138-dayweek-h-timeline-zoom-phase-3b7)
- [1.140 Dev environment isolation (separate Neon + Google accounts)](#1140-dev-environment-isolation-separate-neon--google-accounts)
- [1.141 Bootstrap-admin KAH crash fix (bugfix)](#1141-bootstrap-admin-kah-crash-fix-bugfix)
- [1.142 KAH Status: admins always see the page with all groups](#1142-kah-status-admins-always-see-the-page-with-all-groups)
- [1.144 Highlight my entries across dashboard views (Phase 3b8)](#1144-highlight-my-entries-across-dashboard-views-phase-3b8)
- [1.145 Dark-mode my-entry tint fix](#1145-dark-mode-my-entry-tint-fix)
- [1.151 Cold-open splash fix: streamed banner/KAH shell chrome (Neon scale-to-zero)](#1151-cold-open-splash-fix-streamed-bannerkah-shell-chrome-neon-scale-to-zero)
- [1.152 Android PWA splash, take two: lazy googleapis + precached launch shell](#1152-android-pwa-splash-take-two-lazy-googleapis--precached-launch-shell)
- [1.153 Document navigations routed by cache age (instant vs fresh)](#1153-document-navigations-routed-by-cache-age-instant-vs-fresh)
- [1.154 Reverse the banner-reservation decision (no phantom gap while pending)](#1154-reverse-the-banner-reservation-decision-no-phantom-gap-while-pending)
- [1.167 PWA launch regression: cached-first documents + unconditional launch shell](#1167-pwa-launch-regression-cached-first-documents--unconditional-launch-shell)
- [1.169 Notes "Edit:" link opens the event details modal (legacy `?edit=` kept)](#1169-notes-edit-link-opens-the-event-details-modal-legacy-edit-kept)
- [1.170 Pinned-events header ticker (rotating titles + inline count + `pinnedHeader` template target)](#1170-pinned-events-header-ticker-rotating-titles--inline-count--pinnedheader-template-target)
- [1.171 `db:seed` no longer seeds departments or users](#1171-dbseed-no-longer-seeds-departments-or-users)

## 1.1 Status

- **Phase 0 (spec & decisions):** complete
- **Phase 1 (scaffold):** complete — builds, lints, typechecks, and tests pass locally
- **Phase 2 (roster/seeding/auth-fix):** roster + departments CRUD shipped; `db:seed`
  working; Next.js upgraded to 16.3.1 fixing the post-login `useEffectEvent` crash
- **Phase 2d (departments = Google Calendars):** departments are now `calendars` rows
  (kind = `department`), each user has a single `department_id` (dropped
  `departments`/`user_departments`), real Google Calendar ACL sharing + audit logging
  shipped. `pnpm build/lint/typecheck/test` (53) pass, `db:generate` shows no drift.
- **Phase 2e (mobile-only UI + rename):** shell switched from hamburger/sidebar to a fixed
  **bottom nav bar**; lists refactored to mobile **card layouts** with `fullScreen` modals;
  the "Roster" section renamed to **Users** (`/roster` → `/users`). No schema changes.
- **Phase 2g (event types):** new **Event Types** admin settings tab (`/settings/event-types`)
  for a lookup list of taggable event names (create/rename/delete). Migration `0005` adds the
  `event_types` table (unique `name`). `pnpm build/lint/typecheck/test` (68) pass; `db:generate`
  shows no drift.
- **Phase 2h (calendar events):** the `/dashboard` placeholder is now a real month calendar
  (`@mantine/schedule` `MonthView`) with create/edit/delete/view of Google Calendar events,
  calendar + event-type filters, and per-day event rendering. Event data stays 100% in Google
  Calendar (no DB table); the event type is stored in the event "notes" (`description`) as an
  extensible JSON block. `pnpm build/lint/typecheck/test` (86) pass; `db:generate` shows no
  drift.
- **Phase 2i (dashboard view toggle):** `/dashboard` gains a Month ⇄ MobileMonth view
  toggle (`?view=mobile` URL param); a day tap in either view opens an `AgendaView`
  modal. No schema changes; `pnpm lint/typecheck/test` (86) pass, `db:generate` no drift.
- **Phase 2j (agenda day swipe):** the agenda modal now changes day via left/right swipe
  (touch or mouse drag) and prev/next chevrons flanking the title; swiping across a
  month edge auto-navigates `?month=` so the new month's events load while the modal
  stays open. No schema changes; `pnpm lint/typecheck/test/build` pass.
- **Phase 2k (schedule view + event invitees):** `/dashboard` gains a third view —
  **Schedule** (`@mantine/schedule` `ResourcesDayView`), one row per user plus a
  department row per filtered department — and an **invitee system**: events store
  `createdBy`/`inviteeUsers`/`inviteeDepartments` in the notes JSON, and an "Invitees"
  multi-select in the event form tags people/departments whose rows show the event. The
  view switcher is now a full-viewport tab strip (Month / Mobile / Schedule). No schema
  changes; `pnpm lint/typecheck/test` (103) pass, `db:generate` no drift; verified in the
  dev environment against the live dev Google Calendar (invitee-tagged event rendered in
  both the department and user rows; smoke event deleted afterwards).
- **Phase 2l (cross-department event copies):** the event form no longer offers a
  calendar picker — the target calendars are derived (creator's department + each tagged
  person's department + tagged departments) and one linked copy of the event is created
  per target. Copies share an `eventId` in the notes JSON so the app treats them as one
  logical event: edits/deletes reconcile and cascade to every copy, and the month views
  dedupe by `eventId`. Legacy events get the group id backfilled on first edit. No
  schema changes; `pnpm lint/typecheck/test` (114) pass, `db:generate` no drift;
  verified live (2-copy cross-dept create, dedupe, edit reconcile with move, re-tag
  copy, delete cascade, legacy backfill).
- **Phase 2o (event title template):** admins define an **event title template**
  (`settings.event_title_template`, default `'{description}'`) that composes the title
  written to Google Calendar events — `{description}`, `{type}`/`{type:acronym}`,
  `{departments}`, and invited personnel as `{people}` / `{people:full}` / `{people:acronym}` /
  `{people:fqn}` (bare = FQN via the display-name template). The raw description round-trips
  through `notes.title` so editing never re-types the rendered title. Only newly created/edited
  events re-render. `pnpm lint/typecheck/test` (146) pass; `db:generate` no drift
  (migration `0008`).
- **Phase 2p (event type acronym + Templates tab):** event types gain an app-required, unique
  **shortname** acronym (migration `0009`) rendered by the new `{type:acronym}` event title
  token, and the two template cards move from the General tab into a dedicated **Templates**
  tab (`/settings/templates`). The General tab now holds only the login keyword.
  `pnpm lint/typecheck/test` (151) pass; `db:generate` no drift.
- **Phase 2q (schedule view space optimization):** the Schedule view's left columns are
  compressed for mobile — user rows show the shortname (full-name tooltip), department rows
  drop their text for an icon, and the group header rotates 90° in a narrow column.
  `pnpm lint/typecheck/test` (152) pass; `db:generate` no drift (no schema change).
- **Phase 2s (calendar user filter):** the `/dashboard` filter dialog gains a **Users** group
  (role-scoped active users, display-name labels) with a one-tap **"Only me"** quick action
  beside it; `?users=` is honored by `fetchMonthEvents`, showing events created by or tagged
  on the selected users in every dashboard view. `pnpm build/lint/typecheck/test` (193) pass,
  `db:generate` shows no drift.
- **Phase 2u (Google Calendar "Edit in app" link):** every event's Google notes now start
  with a human-readable `Edit: <url>` line (also stored as `notes.editLink`) that deep-links
  to `/dashboard?date=<start>&edit=<event group id>` and opens the event's edit form
  directly (dismissable "could not open" alert when the event isn't in the current view).
  The link origin is derived from the request headers (no new env config). No schema
  changes; `pnpm lint/typecheck/test` (203) + `pnpm build` pass, `db:generate` no drift.
- **Phase 2v (compressed opaque notes block):** the Google notes block is now opaque —
  brotli-compressed and base64url-encoded (no padding) on a single line below the
  `Edit: <url>` line (block shrinks ~585 → ~220 chars worst case; raw uuids/titles no
  longer leak to calendar viewers); the redundant in-JSON `editLink` field was dropped.
  `parseEventNotes` still reads v1 (raw JSON) and v2 (JSON line) events, so no migration.
  No schema changes; `pnpm lint/typecheck/test` + `pnpm build` pass, `db:generate` no
  drift.
- **Phase 2w (searchable user filter):** the dashboard's filter dialog now renders the
  **Users** group as a searchable dropdown (same pattern as the event form's invitees
  picker) instead of one checkbox card per user. The shared `FilterModal` gains a `search`
  group variant ("empty selection = no filter") for large option lists; grid groups are
  unchanged. `pnpm lint/typecheck/test` (208) + `pnpm build` pass, `db:generate` no drift.
- **Phase 3a (PWA installability):** Cloudy is installable as a PWA — web app manifest
  (`/manifest.webmanifest`, brand colors + 192/512/maskable icons), iOS metadata
  (`appleWebApp` + `apple-touch-icon`), and a Serwist service worker (Turbopack variant)
  served from `/serwist/sw.js`. **Network-first policy:** the SW caches only immutable
  static assets; pages, RSC, auth, and any `/api/*` are `NetworkOnly` so data is always
  fresh from the DB/Google Calendar and never served stale. No push notifications yet.
   `pnpm build` (SW bundled, 50 precache entries) + `lint/typecheck/test` (220) pass,
   `db:generate` no drift. Manual iOS/Android install checks pending.
- **Phase 3b (touch-friendly input heights):** every single-line input (text boxes +
   dropdowns) is 1.2× taller via one `components.Input.vars` override in the theme —
   Mantine 9 drives input heights with `--input-height-*` CSS variables, and the base-
   `Input` vars merge into all of `TextInput`/`PasswordInput`/`Select`/`MultiSelect`.
   The login field's local 1.5× height hack was removed, so it now matches the global
   scale. No schema changes; `pnpm lint/typecheck/test` (220) pass, `db:generate` no
   drift.
- **Bugfix (grid-group apply semantics):** `FilterModal` no longer collapses a fully
  selected **grid** group to "no filter" when the user edited it — the explicit selection
  (including "all") is applied. Previously a non-admin who ticked every calendar got the
  "no filter" value, which the server resolves to their department default, so they could
  never view all calendars. "Clear" still restores the consumer default (department for
  non-admins, all for admins) and untouched groups re-apply their current values. The
   apply resolution is a pure, unit-tested helper in `src/lib/filters/resolveFilterApply.ts`.
   `pnpm lint/typecheck/test` (220) + `pnpm build` pass, `db:generate` no drift.
- **Bugfix (overview cross-dept filter):** Overview matrix rows no longer intersect the
   `users` filter — a non-admin filtering to another department with a users filter (e.g.
   "Only me") active now sees that department's rows instead of the "No users to show"
   empty state. Row scoping moved to a pure helper (`src/lib/overview/scope.ts`, 6 unit
   tests) mirroring the dashboard, where `users`/`types` narrow events only.
   `pnpm lint/typecheck/test` (244) pass, no schema change.
- **Bugfix (cross-dept user options in filter dialogs):** the filter dialog's **Users**
   group now offers the users of the selected department(s) — plus the current user so
   "Only me" still works — instead of being pinned to a non-admin's own department. This
   applies to both the Overview and Dashboard filters (shared pure helper
   `src/lib/filters/filterUserOptions.ts`, 6 unit tests). The event-form **invitee
   picker** stays own-department-scoped (creation context). `pnpm lint/typecheck/test`
   (250) pass, no schema change.
- **Bugfix (overview full-selection rows):** the Overview matrix no longer collapses to a
   non-admin's own department when they select **all** departments — rows always follow
   the selected departments (dashboard parity). The `narrowed`-length heuristic in
   `overviewRowUserIds` was replaced with a rule where a full selection is a real
   selection; only the admin default/full-selection keeps unassigned users. 7 unit tests.
   `pnpm lint/typecheck/test` (251) pass, no schema change.
- **Tweak (overview shortname headers):** the Overview matrix column headers now render
   the event-type **shortname** acronym (e.g. "LL", "OL") with the full name as a
   tooltip; the filter dialog and `?types=`/counts still use full names. No schema
   change.
- **Deployment (Vercel):** build passes on `main`/`dev` with no warnings (Corepack +
  `NEXTAUTH_URL` unset). Migrations `0000` + `0001` applied to Neon (via CI migrate job);
  `0002`–`0005` pending (apply on next `main` push).
- **Phase 3e (externally created events):** events created directly in Google Calendar
  (no app notes) are now flagged as **external** — an "External" badge in the event
  detail modal, and a department-row pin in the Day (schedule) view so they stay visible.
  In-app events carry a new bottom note line `Created in cloudy2` written on every
  create/edit. `pnpm build/lint/typecheck/test` (262) pass, `db:generate` no drift.
- **Phase 3g (calendar caching layer):** the Google Calendar month read is now cached
  server-side in a Postgres `google_event_cache` table (see §1.42) — repeat month views skip
  Google, the per-calendar fan-out is parallelized, and adjacent months are prefetched.
  `pnpm build/lint/typecheck/test` pass, `db:generate` no drift beyond the new table.
- **Phase 3h (calendar force refresh):** the dashboard header gains a force-refresh button
  (see §1.43) — a one-shot `?refresh=` nonce makes the same RSC render bypass the cache
  freshness window and block on fresh Google fetches for the selected calendars × displayed
  month. No schema changes; `pnpm lint/typecheck/test/build` pass.
- **Phase 3q (day-view date picker):** the Day view's 7-day mini-calendar strip is removed;
  a **"Select date"** item in the ⋮ menu (Day view only) opens a `MobileMonthView`-based
  floating date picker (`DateSelectorModal`). Month navigation is driven by a custom header
  (‹ ›), and tapping a day navigates `?date=`/`?month=` and closes the picker. No schema
  changes; `pnpm lint/typecheck/test/build` pass.
- **Phase 3x (agenda day slide-in + create button):** the Month-view day-agenda modal now
  animates day changes — the incoming day's agenda slides in (220ms, from the
  swipe/chevron direction; reduced-motion aware) instead of hard-swapping — and gains a
  full-width "New event" button below the list that opens the event form prefilled with
  the viewed day. No schema changes; `pnpm build/lint/typecheck/test` pass.
- **Phase 3y (agenda-tab day swipe + slide):** the dashboard's Agenda tab now changes days
  by left/right swipe (touch or mouse drag) with the same directional slide-in as the
  day modal; in-month changes apply optimistically from local state (no skeleton) and
  sync `?date=` with a plain no-transition push, while cross-month changes run the usual
  data navigation (skeleton + fade). The ‹/› chevrons, Today, and the date picker use the
  same writer, and the New-event FAB prefills the viewed day on this tab. No schema
  changes; `pnpm build/lint/typecheck/test` pass.
- **Phase 3aa (filter quick actions in the 3-dot menus):** the dashboard and parade-state
  ⋮ menus now hold the one-tap filter actions directly (see §1.67) — a **"My Events"**
  toggle (Users filter = current user), a **Clear** item (restores the consumer's
  default), and **More Filters** (renamed from "Filters", opens the dialog). The
   dialog keeps its own **"My Events"** quick action (`FilterGroup.action` beside the
   Users group label, draft-scoped) and its draft-`Clear`. Audit log untouched (its ⋮
   menu is the filter panel itself). No schema changes; `pnpm lint/typecheck/test` pass.
- **Phase 3ad (legible audit log details):** every `audit_logs` `details` payload is now
   human-readable (see §1.73) — event rows carry a name-based snapshot with a
   pre-formatted datetime and the rendered Google title, event updates store a true
   before/after diff, and the Details modal renders flat payloads as label/value lines
   (legacy rows included). No schema changes; `pnpm lint/typecheck/test` pass.

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
| Settings           | Single-row `settings` table (admin password hash, keyword, KAH %)                              |
| User→dept          | One department per user: `users.department_id` → `calendars.id` (nullable, ON DELETE SET NULL) |
| PWA / monorepo     | Deferred / not used                                                                            |

## 1.3 Implemented (Phase 1)

### 1.3.1 Tooling

- Next.js `16.3.1` (Turbopack), React `19.2.8`, TypeScript, pnpm `11.18.0`
- `packageManager` + `engines` pinned in `package.json`
- Mantine v9 wired via `postcss.config.cjs` + `MantineProvider` + `optimizePackageImports`
- Drizzle `0.45.2` + `postgres-js`; Vitest `4.1.10`; ESLint 9 + Prettier
- Native build scripts approved in `pnpm-workspace.yaml` (`allowBuilds`: esbuild, sharp,
  unrs-resolver)
- CI workflow (`.github/workflows/ci.yml`): lint, typecheck, test, schema-drift check

### 1.3.2 Database schema (`src/db/schema.ts`)

7 tables: `users`, `departments`, `user_departments`, `calendars`, `acronyms`,
`parade_states`, `settings`. Lazy DB client (`src/db/index.ts`) avoids requiring
`DATABASE_URL` at build time. Migration generated at `drizzle/0000_serious_ezekiel_stane.sql`.

```mermaid
erDiagram
    USERS {
        uuid id PK
        text name
        text phone UK
        text email
        date birthday
        text role
        text password_hash
        text status
        timestamp created_at
        timestamp updated_at
    }
    DEPARTMENTS {
        uuid id PK
        text name UK
        integer sort_order
        timestamp created_at
        timestamp updated_at
    }
    USER_DEPARTMENTS {
        uuid user_id FK
        uuid department_id FK
        boolean is_primary
    }
    CALENDARS {
        uuid id PK
        uuid department_id FK
        text google_calendar_id UK
        text name
        text kind
        timestamp created_at
        timestamp updated_at
    }
    ACRONYMS {
        uuid id PK
        text acronym
        text meaning
        boolean active
        integer sort_order
    }
    PARADE_STATES {
        uuid id PK
        text code
        text label
        text description
        boolean active
        integer sort_order
    }
    SETTINGS {
        text id PK
        text admin_password_hash
        text user_keyword
        integer kah_percentage
        text kah_notification_emails
        timestamp updated_at
    }
    USERS ||--o{ USER_DEPARTMENTS : "has"
    DEPARTMENTS ||--o{ USER_DEPARTMENTS : "has"
    DEPARTMENTS ||--o{ CALENDARS : "has"
```

### 1.3.3 Auth & routing

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

### 1.3.4 Google integration (stub)

- `src/lib/google/types.ts` — `GoogleIntegration` interface
- `src/lib/google/stub.ts` — no-op implementation
- `src/lib/google/index.ts` — `getGoogleIntegration()` returns the stub until credentials
  are provisioned

### 1.3.5 Tests

- `src/lib/login.test.ts` — 8 passing tests (login parsing)

## 1.4 Verification status

| Check              | Result                |
| ------------------ | --------------------- |
| `pnpm build`       | pass                  |
| `pnpm lint`        | pass                  |
| `pnpm typecheck`   | pass                  |
| `pnpm test`        | 8/8                   |
| `pnpm db:generate` | 7 tables, 1 migration |

## 1.5 Deployment (Vercel) — current blocker & fix

Vercel auto-builds: `main` → production, `dev` → preview.

Two issues were diagnosed and fixed in-repo (committed and pushed to both `dev` and `main`):

1. **`TypeError: Invalid URL` during `/login` prerender.** Caused by an empty
   `NEXTAUTH_URL` env var (NextAuth's `parseUrl` does `new URL('')`). Fix: leave
   `NEXTAUTH_URL` **unset** on Vercel — it injects `VERCEL_URL` and NextAuth falls back
   automatically.
2. **"Ignored build scripts" warning** (esbuild, sharp, unrs-resolver). Root cause: Vercel
   detects pnpm **10** from `lockfileVersion: 9.0` and ignores the pnpm-11 `allowBuilds`
   config. Fix: enable Corepack so Vercel honors `packageManager: pnpm@11.18.0`.

### 1.5.1 Remaining manual steps (Vercel dashboard)

- [x] Add `ENABLE_EXPERIMENTAL_COREPACK` = `1` — done, build passes with no warnings
- [x] Add `NEXTAUTH_SECRET` (`openssl rand -base64 32`) — done per user
- [x] Add `DATABASE_URL` (Neon) — done per user
- [x] Remove any empty `NEXTAUTH_URL` — done per user
- [x] Redeploy and confirm build passes — done, no warnings
- [ ] Set `ADMIN_INITIAL_PASSWORD` on Vercel (seeds the admin password hash on first login)
- [x] Add `DATABASE_URL` as a GitHub Actions repo secret (feeds the CI migrate job)

## 1.6 CI migrations (Phase 1.5)

```mermaid
flowchart LR
    A[Push / PR] --> B{Quality gates}
    B --> C[pnpm lint]
    B --> D[pnpm typecheck]
    B --> E[pnpm test]
    B --> F[pnpm db:generate<br/>schema-drift check]
    C --> G[pass]
    D --> G
    E --> G
    F --> G
    G --> H{Branch}
    H -- main --> I[pnpm db:migrate<br/>against Neon]
    H -- dev / PR --> J[Vercel preview build]
    I --> K[Production]
    J --> L[Preview]
```

- `migrate` job added to `.github/workflows/ci.yml`: `needs: quality`, runs only on
  `main` push (`if: github.ref == 'refs/heads/main'`), serialized via a `db-migrate`
  concurrency group so concurrent pushes can't race. Applies `pnpm db:migrate` against
  Neon using the `DATABASE_URL` repo secret.
- Single shared Neon DB across Vercel `dev`/`main`, so main-only migration keeps both
  environments schema-synced. Pending `0000` + `0001` apply automatically on the next
  `main` push — no local migrate step needed.

## 1.7 Bootstrap & schema hardening (Phase 1.5)

- `settings` table now has a `settings_singleton` CHECK constraint (`id = 'singleton'`,
  `text` PK with default) — a second row is impossible. Migration `0001` generated.
- `drizzle/meta/` is now **committed** (was gitignored). CI schema-drift step is
  `pnpm db:generate && git diff --exit-code -- drizzle/` so drift actually fails the build.
- `src/lib/bootstrap.ts` `ensureSettingsRow()` lazily seeds the singleton settings row on
  first auth, hashing `ADMIN_INITIAL_PASSWORD` (env). Called at the top of `authorize` in
  `src/lib/auth.ts`. Race-safe via `onConflictDoNothing` + check constraint.
- `ADMIN_INITIAL_PASSWORD` added to `.env.example`.

## 1.8 Roster & Departments (Phase 2a)

- **`src/lib/roster/validate.ts`** — pure helpers: `normalizePhone` (exactly 8 digits after
  stripping), `validateUserForm`, `validateDepartmentForm`. Unit-tested (15 cases).
- **`src/lib/roster/queries.ts`** — `listUsers()` (join `user_departments` + `departments`,
  primary flag, sorted), `listDepartments()`.
- **`src/lib/roster/actions.ts`** — Server Actions guarded by `requireAdmin()`:
  `createUser`, `updateUser`, `setUserStatus` (deactivate-only; no hard delete),
  `createDepartment`, `updateDepartment`, `deleteDepartment`. Exactly-one-primary enforced;
  unique-violation errors mapped to form fields; `revalidatePath` after mutations.
- **`/roster`** — admin-only table (search name/phone, filter status + department, badges
  for role/status/departments with primary marked), create/edit modal, activate/deactivate.
- **`/departments`** — admin-only name + sortOrder CRUD, delete-with-cascade confirm.
- **`AppShellShell`** — Roster/Departments nav links only for admins (role passed from the
  protected layout).
- Verification: migrations applied to Neon (2/2), all 7 tables live, roster queries hit the
  live DB. `pnpm build/lint/typecheck/test` all pass.

## 1.9 Seeding (Phase 2b)

- **`src/db/seed.ts`** — `pnpm db:seed` (tsx). Idempotent, refuses to run with
  `NODE_ENV=production`. Reads `DATABASE_URL` from env or `.env.local`. Seeds 4
  departments, 4 users, 5 memberships; also sets `settings.userKeyword = 'leave'` when
  empty so seeded users can log in as `[phone]leave`. Verified: 4/4/5 created, re-run
  inserts 0.

## 1.10 Next.js 16 upgrade & auth fix (Phase 2c)

**Root cause of login crash (`useEffectEvent is not a function`):** Next.js 15.5.23
bundles its own React (`19.2.0-canary-0bdb9206-20250818`) and aliases all `react`
imports to it at runtime — the installed React version is bypassed. That bundled React
had no `useEffectEvent`, which Mantine v9.5.1 (peer `react ^19.2.0`, the whole v9 line
requires React 19.2 stable) calls inside `AppShell`. The protected shell crashed right
after login on both Vercel and local. This predated the roster work (latent since
Phase 1); it surfaced once login reached the protected layout.

**Fix:** upgraded Next.js `15.5.23` → `16.3.1` (the line that bundles React 19.2 stable;
installed bundle is `19.3.0-canary` with `useEffectEvent`). Also `eslint-config-next`
`15.5.23` → `16.3.1`.

- `eslint.config.mjs` rewritten: Next 16 ships flat configs directly, so
  `next/core-web-vitals` + `next/typescript` are imported as arrays instead of via
  `FlatCompat` (the legacy wrapper crashed with a circular-structure error).
- `next.config.ts` unchanged (`experimental.optimizePackageImports` still valid).
- tsconfig auto-updated by Next 16: `jsx: preserve` → `react-jsx`, added
  `.next/dev/types/**/*.ts`.
- Verified with `next start`: admin login → dashboard/roster/departments 200;
  non-admin (Bob `82345678leave`) → dashboard 200, `/roster` + `/departments` 307 →
  `/dashboard`. `pnpm build/lint/typecheck/test` (23) pass.

## 1.11 Departments as Google Calendars + sharing + audit (Phase 2d)

Departments are now Google Calendars: the `calendars` table is the department registry,
Google Calendar is the source of truth for existence/ACLs, and nothing sharing-related is
stored in the DB.

- **Schema** — migrations `0002`–`0004`: `users.department_id` (backfilled from
  `user_departments`, then `departments`/`user_departments` dropped), `calendars` no
  longer references `departments`, new `audit_logs` table. `src/db/schema.ts` rewritten
  to match `0004` exactly (verified: `pnpm db:generate` produces no diff).
- **Google layer** — `src/lib/google/config.ts` (env parsing, `getServiceAccountConfig`,
  `getAdminGoogleEmail`), `real.ts` (JWT service account, Calendar v3; event/Gmail methods
  still throw "not implemented yet"), `types.ts` (interface + `GoogleCalendarInfo`),
  `stub.ts` (no-op fallback), `index.ts` (`getGoogleIntegration()` real-when-configured,
  `googleCalendarConfigured()`). Env vars: `GOOGLE_SERVICE_ACCOUNT_BASE64` (or
  `GOOGLE_CLIENT_EMAIL`/`GOOGLE_PRIVATE_KEY`) + `GOOGLE_DELEGATE_EMAIL`.
- **Sharing** — `src/lib/roster/shares.ts` (`listDepartmentAccess` reconciles assigned
  users as readers, grants admin owner, returns `DepartmentAccess`); actions
  `get/grant/revokeDepartmentAccess`; UI modal `DepartmentShares.tsx` (copy calendar ID,
  add/remove manual shares, surfaces `syncWarning` when Google is unconfigured).
- **Audit** — `audit_logs` written best-effort via `src/lib/audit/log.ts` +
  `build.ts` (actions `user.create`/`calendar.create`/`access.grant`/…, field diffs via
  `diff.ts`). Hooked into roster + calendar + share server actions.
- **Roster (single-department)** — `users` has one `department_id`; `queries.ts`
  `listUsers()` left-joins `calendars`, `UserTable`/`UserForm` use a single clearable
  department select; `actions.ts` `createUser`/`updateUser`/`setUserStatus`.
- **Departments page** — `DepartmentTable` lists calendars (name + calendar ID) with
  Share/Rename/Delete; `DepartmentForm` creates/renames a Google Calendar; creation is
  blocked with a clear message when Google is unconfigured.
- **New dependency** — `@tabler/icons-react` added (used by `DepartmentShares`).
- Verification: `pnpm build/lint/typecheck/test` (53) pass; `db:generate` shows no schema
  drift.

## 1.12 Mobile-only UI refactor and Users rename (Phase 2e)

The app is **strictly mobile-only**: no desktop sidebar/hamburger layout exists anymore.

- **Bottom nav** — `src/components/AppShellShell.tsx` renders `AppShell.Footer` with
  icon + label links (Dashboard `IconLayoutDashboard`, Users `IconUsers`, Departments
  `IconBuilding`; non-admins see only Dashboard). Header is a slim centered "Cloudy" brand
  bar; footer adds `env(safe-area-inset-bottom)` padding. Active tab matched via
  `pathname.startsWith(href)`.
- **Card lists** — `UserTable` and `DepartmentTable` render each row as a stacked
  `Paper` card (badges + action buttons) instead of `<Table>`; the users filter bar stacks
  vertically. Modals (`UserForm`, `DepartmentForm`, `DepartmentShares`, delete confirm)
  are floating `centered` dialogs with a fixed `size`.
- **"Users" rename** — nav label + page title "Roster" → "Users"; route `/roster` moved
  to `/users` (`git mv src/app/(protected)/roster src/app/(protected)/users`,
  `RosterPage` → `UsersPage`). `src/lib/roster/actions.ts` `revalidatePath` calls and the
  `src/lib/audit/build.test.ts` route fixtures updated. The internal `src/lib/roster/*`
  module namespace is intentionally left as "roster".
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (53), and `pnpm build` all
  pass; build route list shows `/users` and no `/roster`.

## 1.13 Admin Settings hub and login keyword (Phase 2f)

The Users and Departments sections now live under a single **Admin Settings** hub,
reachable only via the profile icon in the header. The bottom nav bar is gone.

- **Routing** — `src/app/(protected)/users` and `.../departments` moved to
  `src/app/(protected)/settings/users` and `.../settings/departments`. A new
  `settings/layout.tsx` calls `requireAdmin()` once (removed from the two pages) and
  renders a horizontal, scrollable `SettingsTabs` bar; `settings/page.tsx` redirects
  `/settings` → `/settings/users` (Users is the default tab). Tabs: **Users**
  (`/settings/users`), **Departments** (`/settings/departments`), **Event Types**
  (`/settings/event-types`), **Templates** (`/settings/templates`), **General**
  (`/settings/general`) — Event Types and Templates were added in phases 2g and 2p.
  `next.config.ts` adds permanent redirects from the old `/users` and `/departments`
  URLs.
- **Keyword setting (General tab)** — new `src/lib/settings/*` module mirroring the
  roster module: `validate.ts` (`normalizeKeyword` → trimmed, lowercased, `/^[a-z]{1,12}$/`,
  plus `validateKeywordForm`; unit-tested), `queries.ts` (`getSettings()` returns only
  `userKeyword`, never the admin password hash), `actions.ts` (`updateKeyword` server
  action: `requireAdmin`, validate, `UPDATE settings`, audit log `settings.update` with a
  field diff, `revalidatePath("/settings/general")`). `AUDIT_ACTIONS.settingsUpdate` added
  to `src/lib/audit/build.ts`.
- **Navigation** — `AppShellShell` drops the `AppShell.Footer`/bottom nav entirely; the
  "Cloudy" brand is now a link to `/dashboard`. `UserMenu` takes a `role` prop and shows an
  **Admin Settings** item (→ `/settings`) for admins only, above Log out.
  `FloatingToolbar` bottom offset changed from the old footer clearance (76px) to
  `calc(env(safe-area-inset-bottom) + 16px)`.
- **Revalidation** — `src/lib/roster/actions.ts` `revalidatePath` targets updated to
  `/settings/users` and `/settings/departments`.

```mermaid
flowchart LR
    A[Dashboard] -->|profile icon| B[UserMenu]
    B -->|admin only| C[Admin Settings]
    C --> D[Users tab]
    C --> E[Departments tab]
    C --> F[Event Types tab]
    C --> G[Templates tab]
    C --> H[General tab]
    H --> I[Update login keyword]
```

- Verification: `pnpm lint/typecheck/test/build` pass; no schema change so `db:generate`
  shows no drift.

## 1.14 Event Types (Phase 2g)

A new **Event Types** tab in Admin Settings lets admins define the list of event names that
can later be tagged onto calendar events. This phase ships only the lookup list (create /
rename / delete) — tagging onto events is a future phase.

- **Schema** — migration `0005` adds `event_types` (`id` uuid pk, `name` text not null,
  `created_at`/`updated_at`) with a unique index on `name` so the same tag can't be defined
  twice. `src/db/schema.ts` exports the `eventTypes` table + `EventType` type. Phase 2p adds
  an app-required, unique `shortname` acronym (migration `0009`, mirroring `users.shortname`).
- **Module** — `src/lib/eventTypes/*` mirrors the roster module:
  `validate.ts` (`validateEventTypeForm`, unit-tested), `queries.ts` (`listEventTypes()`
  ordered by name; `getEventTypesByNames()` for title rendering), `actions.ts`
  (`createEventType`/`renameEventType`/`deleteEventType` server actions — `requireAdmin`,
  validate, DB op, audit log, `revalidatePath`, unique violation → "already exists" error,
  routed by constraint for `name` vs `shortname`).
- **UI** — `src/app/(protected)/settings/event-types/` (`page.tsx`, `EventTypeTable.tsx`
  card list showing name + shortname, Rename/Delete + floating "Add event type" button,
  `EventTypeForm.tsx` centered modal with required Name + Shortname, `loading.tsx` skeleton).
  Added to `SettingsTabs` between Departments and General.
- **Audit** — `AUDIT_ACTIONS` gains `eventType.create`/`eventType.rename`/
  `eventType.delete`.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (68), `pnpm build`, and
  `pnpm db:generate` (no drift) all pass; build route list shows `/settings/event-types`.

## 1.15 Next steps (Phase 2+)

1. Wire the real Gmail method in `real.ts` (Gmail send-as, KAH visibility) — calendar
   event read/write is now implemented.
2. Core screens still pending: KAH constraint checks, parade states, acronyms on event
   titles, on-behalf/masquerade permissions, and VCF contacts export.
3. Gmail notifications for KAH percentage breaches.

## 1.16 Calendar events (Phase 2h)

The `/dashboard` placeholder is replaced by a real month calendar with full event
create/edit/delete/view. Events remain 100% in Google Calendar — no event table exists.

```mermaid
flowchart LR
    A[Dashboard] --> B[MonthView]
    B --> C{Interaction}
    C -- click day / FAB --> D[EventForm modal]
    C -- click event --> E[EventDetail modal]
    D --> F[Server action]
    E --> G[Edit / Delete]
    F --> H[Google Calendar API]
    G --> H
    H --> I[revalidatePath + router.refresh]
```

- **Dependency** — added `@mantine/schedule@9.5.1` (the `MonthView` component) and `dayjs`
  (its required peer). `@mantine/dates/styles.css` + `@mantine/schedule/styles.css` imported
  in `src/app/layout.tsx` (order: core → dates → schedule).
- **Google layer** (`src/lib/google/`) — implemented `createEvent`/`updateEvent`/
  `deleteEvent`/`listEvents` in `real.ts` (`events.insert/update/delete/list`,
  `singleEvents: true`, `orderBy: startTime`); `listEvents` added to the interface + stub.
  All-day events use Google's `date` field with an exclusive end date; timed events use
  `dateTime`. `GcalEventItem` added for read-back.
- **Events module** (`src/lib/events/*`, mirrors `roster`/`eventTypes`):
  - `notes.ts` — pure encode/parse of the machine-readable "notes" JSON block stored in the
    event `description` (currently `{ eventType }`, extensible for future fields).
  - `datetime.ts` — pure date/time helpers; wall-clock times are treated as fixed
    `Asia/Singapore` (UTC+8, no DST) so conversions are deterministic and testable.
  - `validate.ts` — pure form validation (title/start/end, end ≥ start).
  - `queries.ts` — `listCalendars`, `getUserDepartmentId`, and `fetchMonthEvents` which reads
    events across the selected calendars and maps them to `CalendarEvent` (schedule-ready
    data with a `payload` carrying calendar id, Google event id, all-day flag, and parsed
    event type).
  - `actions.ts` — `createEvent`/`updateEvent`/`deleteEvent` server actions (`requireSession`,
    audit-logged, `revalidatePath("/dashboard")`). Admins pick a target calendar; regular
    users always target their own department.
- **Dashboard** (`src/app/(protected)/dashboard/`) — `page.tsx` (server) reads `month`/`cal`/
  `types` search params and fetches events; `DashboardView.tsx` (client) renders a custom
  header + `MonthView` (`withHeader={false}`), `FilterButton` → `FilterModal` (Calendars +
  Event Types groups), `EventForm.tsx` (description, all-day toggle swapping
  `DateTimePicker` ↔ `DatePickerInput`, event-type `Select`, admin calendar `Select`),
  `EventDetail.tsx` (view + Edit/Delete), a `loading.tsx` skeleton, and a FAB.
- **Default view** — non-admin shows only their department calendar; admin shows all
  calendars. The filter always offers every calendar + every event type (regardless of
  access). Google unconfigured → empty calendar + a notice, and the FAB is disabled.
- **Audit** — `AUDIT_ACTIONS` gains `event.create`/`event.update`/`event.delete`.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (86), `pnpm build` (route list
  shows `/dashboard`), and `pnpm db:generate` (no drift — no schema change) all pass.

## 1.17 Dashboard mobile month view (Phase 2i)

`/dashboard` now supports two views, switched by an icon `SegmentedControl` in the header
row: the default `MonthView` grid, and `@mantine/schedule` `MobileMonthView` (month grid
with event-dot indicators). The choice persists in the URL as `?view=mobile` (omitted =
month), matching the existing `month`/`cal`/`types` URL-state pattern. No new dependency —
`MobileMonthView` and `AgendaView` ship in the already-installed `@mantine/schedule@9.5.1`.

```mermaid
flowchart LR
    A[Dashboard] --> B{view URL param}
    B -- month / default --> C[MonthView grid]
    B -- mobile --> D[MobileMonthView grid]
    C -- click day --> G[AgendaView modal<br/>for that day]
    D -- click day --> G
    G -- click event --> F[EventDetail modal]
    C -- click event --> F
    C -- FAB only --> E[EventForm modal]
    D -- FAB only --> E
    E --> H[Server action → Google Calendar]
    F --> H
```

- **Toggle** — `SegmentedControl` (`size="xs"`, `aria-label="Calendar view"`) with
  `IconCalendarMonth` / `IconCalendarDot` segments, placed between "Today" and the filter
  button in `DashboardView.tsx`. `switchView()` writes/removes the `view` param via the
  existing `navigate()` URL helper (month is the default, so the param is omitted for it).
  `dashboard/page.tsx` reads `view` (`params.view === "mobile" ? "mobile" : "month"`) and
  passes it through; both views render the same fetched month events.
- **MobileMonthView** — rendered when `view === "mobile"`. A day tap (`onDayClick`) opens
  the day-agenda modal shared with MonthView (whose old tap-to-create was replaced by the
  same modal, so creation is strictly from the floating "New event" button in both views —
  its default date stays "today"; the form's date picker covers other days). The
  component's built-in header (year back-button + a month label duplicating our own) and
  bottom event list (duplicated by the agenda modal) are hidden via the `styles` prop:
  `mobileMonthViewHeader` and `mobileMonthViewEventsList` → `{ display: "none" }`. The app's
  own header row remains the only navigation chrome.
- **AgendaView modal** — a day tap in either view opens a floating `centered`
  `size="sm"` modal titled with the full day (e.g. "Saturday, August 16, 2026"), wrapping
  `AgendaView` with a single-day range (`rangeStart` = `rangeEnd` = tapped day) and the
  month's events. `agendaViewHeader` is hidden via `styles` because its label renders
  "X – X" even for a single day; the modal title carries the date instead. Clicking an
  event opens `EventDetail` on top — the agenda modal is rendered before `EventDetail` in
  the tree so its portal mounts first and the detail modal stacks above it. Deleting from
  the detail closes both the detail and the agenda modal before `router.refresh()`, so a
  deleted event doesn't linger in the open agenda list.
- **Mantine 9.5.1 gotchas (verified against the installed package source)** —
  `MobileMonthView` has **no `withHeader` prop** (unlike `MonthView`); the built-in
  header is the only leak and must be suppressed with `styles` overrides. `classNames`
  takes class-name **strings**, not `CSSProperties` — inline style overrides go in the
  `styles` prop, which is deep-merged over the component's own styles with user values
  winning. `EventDetail`'s detail/confirm portals mount only while open, which is what
  makes the agenda → detail stacking order work.
- **Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (86), `pnpm build` (route
  list still shows `/dashboard`), and `pnpm db:generate` (no drift — no schema change) all
  pass.

## 1.18 Agenda day swipe (Phase 2j)

The agenda modal's day can now be changed by swiping left/right across the agenda list
(touch) or dragging it horizontally (mouse), plus prev/next `ActionIcon` chevrons
flanking the date in the modal title for mouse/keyboard use. Swipe left = next day,
swipe right = previous day.

```mermaid
flowchart LR
    A[AgendaView modal] -- swipe / drag / chevron --> B{crosses loaded month edge?}
    B -- no --> C[setAgendaDate ±1 day]
    B -- yes --> D[navigate ?month= ±1<br/>+ setAgendaDate]
    D --> E[dashboard re-fetches<br/>new month's events]
    C --> F[AgendaView re-renders<br/>for the new day]
    E --> F
```

- **Implementation** — `DashboardView.tsx` only, using `useDrag` from the
  already-installed `@mantine/hooks` (no new dependency): options
  `{ axis: "lock", axisThreshold: 8, threshold: 10, filterTaps: true }`. The day changes
  on pointer release when horizontal displacement ≥ `DAY_SWIPE_THRESHOLD` (48px) after
  axis locking; canceled gestures (the browser taking over vertical scroll →
  `pointercancel`) and taps are ignored, so event-row taps still open `EventDetail`.
- **Scroll coexistence** — the wrapper `div` around `AgendaView` sets
  `style={{ touchAction: "pan-y" }}`: native vertical scrolling of a long agenda day is
  kept by the browser, and horizontal gestures are delivered as pointer events. A one-shot
  `onClickCapture` guard swallows the click that would otherwise fire when a mouse drag
  ends on an event row.
- **Month auto-navigation** — events are fetched per calendar month
  (`fetchMonthEvents`), so swiping past the first/last day of the loaded month updates
  `?month=` through the existing `navigate()` URL helper while setting `agendaDate`; the
  `agendaDate` client state survives the RSC navigation, so the modal stays open and the
  agenda repopulates from the new month's `events` prop. `shiftAgendaDay(±1)` is the
  shared helper behind both the chevrons and the swipe handler.
- **Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (86), and `pnpm build`
  all pass; dev-server smoke check shows `/dashboard` 307 → `/login` (auth redirect) and
  `/login` 200.

## 1.19 Schedule view & event invitees (Phase 2k)

`/dashboard` now has three views behind a full-viewport **tab strip** (replacing the old
icon-only `SegmentedControl`): **Month** (`IconCalendarMonth`), **Mobile**
(`IconCalendarDot`), **Schedule** (`IconCalendarUser`) — each tab shows its icon and
label, with the tabs stretched across the viewport above the date-navigation row. The
Schedule view is `@mantine/schedule` `ResourcesDayView`: one row per **user** of the
selected (filtered) departments, plus a **department row** at the top of each department
section. Group header columns appear only when more than one department is filtered.
The day navigates with `‹`/`›`/Today (`?date=YYYY-MM-DD`; `?month` is kept in sync and
derived from `date` by the page), and `?view=schedule` is the URL state.

Because events previously carried no link to a person, this phase adds the **invitee
system**. The notes JSON block on Google events gains three fields (no DB migration —
the notes block is the app's own extensible format):

- `createdBy` — the creating user's id; the creator's row **always** shows the event.
- `inviteeUsers` — ids of tagged users; the event also appears in each of their rows.
- `inviteeDepartments` — ids of tagged department calendars; the event appears in each
  department row.

```mermaid
flowchart LR
    A[EventForm<br/>Invitees MultiSelect] --> B[createEvent / updateEvent<br/>server actions]
    B --> C["Google event description<br/>{eventType, createdBy,<br/>inviteeUsers, inviteeDepartments}"]
    C --> D[fetchMonthEvents<br/>parseEventPeople → payload]
    D --> E["expandScheduleEvents (pure)<br/>rows = creator ∪ tagged users<br/>∪ dept:&lt;calendarId&gt;"]
    F["page: listUsers()<br/>active ∩ selected calendars"] --> G["buildScheduleResources (pure)<br/>dept row + user rows per dept,<br/>groups when >1 dept"]
    E --> H[ResourcesDayView]
    G --> H
```

- **Notes** (`src/lib/events/notes.ts`) — `EventNotes` gains `createdBy?`,
  `inviteeUsers?`, `inviteeDepartments?`; `encodeEventNotes` now also strips empty
  arrays; new pure `parseEventPeople(description)` returns `{ creatorId, userIds,
departmentIds }` and tolerates absent/malformed values (unique, non-empty strings
  only). Unit-tested in `notes.test.ts` (12 cases now).
- **Schedule helpers** (new `src/lib/events/schedule.ts`, all pure, all unit-tested in
  `schedule.test.ts` — 12 cases):
  - `departmentRowId`/`isDepartmentRowId` — resource rows keyed `dept:<calendarId>` to
    keep them distinct from user-uuid rows.
  - `rowsForEvent(people)` — union of creator, tagged users, and tagged departments,
    deduped.
  - `expandScheduleEvents(events)` — one `ScheduleEvent` per row (`id` suffixed
    `::rowId`, `resourceId` set); events linked to no one expand to nothing.
  - `buildScheduleResources({ departments, users, events })` — per selected department:
    a department row then its active users (sorted by name); a userless department is
    kept only when an event tags it; `groups` emitted only for >1 department.
- **Queries** (`src/lib/events/queries.ts`) — `CalendarEventPayload` gains
  `creatorId`/`inviteeUserIds`/`inviteeDepartmentIds`, populated in
  `fetchMonthEvents` via `parseEventPeople`. Month/Mobile/Agenda views ignore the new
  fields.
- **Form & actions** — `EventFormValues` gains `creatorId` + the two invitee arrays
  (pass-through, no new validation). `EventForm` adds an "Invitees" `MultiSelect`
  (Mantine v9's dedicated multi-select component; v9 `Select` has no `multiple` prop)
  with grouped data (`user:<id>` / `dept:<id>` prefixed values disambiguate the two
  uuid namespaces; split on submit). Picker scope: non-admins → own department + its
  active users; admins → all departments + all active users. `creatorId` is the session
  user on create and is **preserved from the original payload on edit** (editing never
  reassigns the creator row). `actions.ts` writes the three notes fields and audit
  `details` record invitee counts.
- **Page** (`dashboard/page.tsx`) — `view` enum gains `"schedule"`; `date` param
  (validated `YYYY-MM-DD`, default today) drives the month when present. One
  `listUsers()` call derives: schedule rows (active users in the selected calendars),
  role-scoped invitee picker options, and the `peopleNames`/`calendarNames` maps for
  the detail modal.
- **DashboardView** — top `Tabs` strip (controlled, equal-width `flex: 1` tabs with
  icon + label; `Tabs` `onChange` is typed `string | null`) → `switchView` writes
  `?view=schedule&date=today` on entry (month left to be derived) and restores the
  viewed month on exit. Schedule render: `ResourcesDayView` with `withHeader={false}`,
  full-day range (`00:00:00`–`23:59:59`, 60-min intervals, `startScrollTime 07:00`),
  `withCurrentTimeIndicator`, current-time bubble, `onEventClick` → existing
  `EventDetail`, and `renderResourceLabel` styling department rows (building icon +
  bold). Empty state (no rows for the filter) shows a `Paper` notice instead of an
  empty grid. `ScheduleGridSkeleton` (label + lane rows) backs the `isPending` state.
  The date-nav row reuses its chevrons/Today in day mode (`ddd, MMM D, YYYY`).
- **EventDetail** — "People:" badges (creator + tagged users, deduped, resolved via
  `peopleNames`) and "Departments:" badges (tagged departments other than the event's
  own calendar, resolved via `calendarNames`); unknown ids are silently skipped.
- **Back-compat** — events created before this phase have no people fields, so they
  still render in Month/Mobile/Agenda but intentionally do **not** appear in any
  Schedule row (no row key to attach to). Tagging remains optional.
- **Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (103), `pnpm build`,
  and `pnpm db:generate` (no drift — no schema change) all pass. Dev-server smoke
  against the live dev Google Calendar: `/dashboard`, `?view=mobile`,
  `?view=schedule` all 200 with the three tabs rendered (`role="tab"`, correct
  `aria-selected`); a temporary event tagged with the active user + their department
  read back from Google rendered **in both** the department row and the user row of
  `ResourcesDayView`; pre-existing untagged events correctly stayed out of the
  schedule rows; the smoke event was deleted afterwards.

## 1.20 Cross-department event copies (Phase 2l)

The event form **no longer offers a calendar picker** (admins included). Where an event
lives is derived from its people: the **creator's department** plus every **tagged
user's department** plus every **tagged department** — one Google Calendar copy per
target calendar. When everyone is in one department this is exactly one event (the
pre-2l behavior, now automatic); a creator with no department can create an event only
by tagging at least one invitee, otherwise creation is blocked with
"Assign yourself to a department or tag an invitee".

All copies of a logical event share a new `eventId` (UUID) in the notes JSON — the
linking mechanism. No DB table is added (events stay 100% in Google Calendar), and
copies are rediscovered by listing each target calendar and matching the `eventId` in
the event description.

```mermaid
sequenceDiagram
    participant F as EventForm
    participant A as events/actions
    participant D as departments (db)
    participant G as Google Calendar
    F->>A: create / update(ref, values) — no calendarId
    A->>D: creator + invited users' departments
    A->>A: targets = union(creatorDept, inviteeDepts, taggedDepts)
    Note over A,G: create: insert one copy per target (same eventId in notes),<br/>rollback partial copies on failure
    Note over A,G: update: per calendar in old∪new targets, list over old∪new time
    range (±1 day), match notes.eventId →<br/>create missing / update existing / delete retired
    Note over A,G: delete: per target in notes-derived set, list + delete all matches
```

- **Targets module** (new `src/lib/events/targets.ts`, pure, unit-tested — 9 cases
  in `targets.test.ts`): `deriveTargetCalendarIds` (creator ∪ invited users' depts ∪
  tagged depts, deduped, nulls dropped), `diffEventTargets` (create/keep/remove plan),
  `dedupeEventsByGroupId` (first copy per group id wins; input order decides the
  representative), and `EventRef` + `eventRefFromCalendarEvent` (the representative
  copy's fields passed to edit/delete).
- **Notes** (`src/lib/events/notes.ts`) — `EventNotes.eventId?`;
  `parseEventPeople` now also returns `eventId: string | null`.
- **Datetime** (`src/lib/events/datetime.ts`) — new `absEventRange(naiveStart,
naiveEnd, allDay)`: timed events parse as UTC+8 instants, all-day events use Google's
  date / exclusive-end-date semantics. `buildGcalEventInput` refactored onto it; the
  reconcile search range is `unionRange(old, new)` grown ±1 day so copies whose times
  drifted (or are being moved) are still found.
- **Queries** (`src/lib/events/queries.ts`) — `CalendarEventPayload.eventId`; the
  calendars row fetch is ordered by name so the deduped representative is
  deterministic; `fetchMonthEvents` returns `dedupeEventsByGroupId(events)` — with
  several department calendars filtered (admin default) a logical event shows **once**
  in Month/Mobile/Agenda/Schedule. New batched `getUserDepartmentIds(userIds)`.
- **Actions** (`src/lib/events/actions.ts`) — rewritten around `EventRef`:
  - `createEvent`: derive targets (empty ⇒ block error), `eventId =
crypto.randomUUID()`, one copy per target; a mid-loop failure rolls back the copies
    already created; audit entry carries `eventId`, target calendar ids/names, and the
    Google event ids.
  - `updateEvent(ref, values)`: `oldTargets` from the ref's people fields, `newTargets`
    from the form; per calendar in the union, `findCopies` (notes `eventId` match; on a
    legacy first edit also the `googleEventId` in the representative calendar) drives
    create / full-contents update / delete. The plan is idempotent, so a half-failed
    attempt self-heals on retry; newly created copies roll back on failure.
  - `deleteEvent(ref)`: targets from the ref's people fields, then list + delete every
    matching copy.
  - **Legacy events** (no `eventId`): keep working as single events; the first edit
    generates the group id, backfills it into the existing copy, and — once invitees are
    spread across departments — converges by creating the missing copies. When nothing
    else derives, the target set falls back to the representative calendar so editing a
    legacy event never blocks.
  - Malformed client bodies (non-array invitee fields) are coerced instead of 500ing.
  - `EventFormValues` drops `calendarId` (and the form/admin picker with it);
    `EventActionResult` no longer targets that field.
- **UI** — `dashboard/page.tsx` drops `initialCalendarId`; `EventForm` drops the
  Calendar `Select` (invitees `MultiSelect` description now explains the per-department
  copies); `EventDetail`/`EventForm` build the `EventRef` via
  `eventRefFromCalendarEvent` for `updateEvent`/`deleteEvent`.
- **Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (114), `pnpm build`,
  and `pnpm db:generate` (no drift — no schema change) all pass. Live smoke against the
  dev Google Calendar (via a temporary authenticated route, removed afterwards):
  admin without a department + no invitees → blocked with the clear error; tagging an
  active dev-COU user + the dev-CIU department → exactly two copies sharing one
  `eventId`, one per calendar; all-calendars read deduped to a single event; renaming +
  time-shifting + dropping the dev-CIU tag in one edit → dev-CIU copy deleted, dev-COU
  copy updated in place with the new title/times; re-tagging dev-CIU → copy recreated
  under the same `eventId`; delete → both copies gone; editing a legacy event →
  `eventId` backfilled with the single copy preserved.

## 1.21 User shortname (Phase 2m)

Users now carry a **shortname** (acronym/initials), captured in the Users create/edit form and
stored for future phases (e.g. schedule/KAH displays) to leverage. Per product decisions: the
field is **required** in the form, **unique** across users, and stored **exactly as typed**
(no normalization).

- **Schema** — migration `0006` adds `users.shortname` (nullable `text`, so the auto-applied
  migration is safe on the populated Neon `users` table) plus a unique index
  `users_shortname_idx` (Postgres allows multiple NULLs under a unique index, so legacy rows
  are untouched). `src/db/schema.ts` updated to match; `drizzle/meta/` journal + snapshot
  committed.
- **Validation** (`src/lib/roster/validate.ts`) — `UserFormValues` gains required
  `shortname: string`, `UserFormErrors` gains `shortname?`; `validateUserForm` returns
  "Shortname is required" for blank/whitespace. Stored as typed — no uppercase/trimming.
- **Actions** (`src/lib/roster/actions.ts`) — `createUser`/`updateUser` write `shortname`,
  the audit snapshot (`userSnapshot`) and `diffFields` include it, and audit `details` carry
  it. `RosterActionResult.field` gains `"shortname"`; the `23505` catch now routes by the
  violated constraint (postgres-js `constraint_name`): `users_shortname_idx` → "A user with
  this shortname already exists" on the shortname field, otherwise the existing phone message.
- **Queries** (`src/lib/roster/queries.ts`) — `RosterUser.shortname: string | null` selected
  and mapped in `listUsers()`.
- **UI** (`UserForm.tsx`) — new required `Shortname` `TextInput` ("e.g. ALICE") between Name
  and Phone; `initialValues` maps `user.shortname ?? ""` on edit; the submit handler surfaces
  the shortname duplicate error on the field. No card-list display change (deferred).
- **Tests** — `validate.test.ts` base form gains `shortname`; new required-shortname cases.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
  `pnpm db:generate` (no drift — migration `0006` in sync) all pass.

## 1.22 Display name template (Phase 2n)

Admins can define a **display name template** that composes each user's fully qualified name
from their name and department. The template is a global setting with `{name}` / `{department}`
placeholders (case-insensitive), e.g. `{name}: DEPT-{department}` renders
`John Lai: DEPT-Engineering 1`. The section lives as a card on the General settings tab, with a
live preview against an example and real users; the reusable helper is wired into the Users
admin card list as proof. Missing values (e.g. a user with no department) render as an empty
string (no gap-collapsing).

- **Schema** — migration `0007` adds `settings.name_template` (`text`, `NOT NULL` default
  `'{name}'`), so existing rows and the bootstrap insert both pick up the plain-name fallback.
  `src/db/schema.ts` updated; `drizzle/meta/` journal + snapshot generated. `ensureSettingsRow`
  needs no change.
- **Formatter** — new pure `src/lib/settings/formatName.ts`: `formatFullName({ name,
departmentName }, template)` substitutes every `{...}` token case-insensitively, resolves
  missing values to `""`, leaves unknown tokens literal, and trims the result. Unit-tested
  (`formatName.test.ts`, 9 cases).
- **Validation** (`src/lib/settings/validate.ts`) — `NameTemplateFormValues`/Errors and
  `validateNameTemplate` (non-empty after trim, ≤ 200 chars); `NAME_TEMPLATE_PLACEHOLDERS`
  (`["{name}", "{department}"]`) drives the insert chips. `validate.test.ts` gains 4 cases.
- **Actions** (`src/lib/settings/actions.ts`) — `updateNameTemplate(template)` mirrors
  `updateKeyword`: `requireAdmin`, validate, `UPDATE settings`, audit-log `settings.update`
  with a `nameTemplate` diff, `revalidatePath("/settings/general")`. `SettingsActionResult.field`
  gains `"nameTemplate"`.
- **Queries** (`src/lib/settings/queries.ts`) — `getSettings()` returns `nameTemplate`
  (falls back to `"{name}"`).
- **UI** (`src/app/(protected)/settings/general/`) — `page.tsx` also fetches `listUsers()`
  (first 5 for preview); `SettingsForm.tsx` gains a second "Display name template" `Paper`
  card: a `TextInput` with `{name}` / `{department}` chips that insert at the cursor, plus a
  live preview (the John Lai / Engineering 1 example then 5 real users) that re-renders as the
  admin types. Save button → `updateNameTemplate`. `loading.tsx` skeleton covers two cards.
- **Proof in Users list** — `settings/users/page.tsx` fetches `getSettings()` and passes
  `nameTemplate` to `UserTable`, where each card renders `formatFullName(...)` as a muted
  secondary line under the user's name.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (128), `pnpm build`, and
  `pnpm db:generate` (no drift — migration `0007` in sync) all pass.

## 1.23 Event title template (Phase 2o)

Admins can define an **event title template** that composes the title written to Google
Calendar events — the same "global template setting + pure formatter + insert chips +
live preview" pattern as the display name template (1.22). The template is
`settings.event_title_template` (default `'{description}'`, i.e. today's raw-description
behavior) expanded by the pure `formatEventTitle()` in
`src/lib/settings/formatEventTitle.ts`. Tokens are case-insensitive:

- `{description}` — the text the user typed into the event form ("Event Description")
- `{type}` / `{type:acronym}` — the event type name, and its shortname acronym (falling back
  to the name when blank); empty when no type is set
- `{people}` / `{people:full}` / `{people:acronym}` / `{people:fqn}` — invited personnel
  joined with `", "`; bare `{people}` and `{people:fqn}` render the fully qualified name
  (via the saved display-name template), `{people:full}` the plain name, and
  `{people:acronym}` the shortname (falling back to the name when blank)
- `{departments}` — invited departments joined with `", "`

Unknown tokens and unknown styles stay literal; empty lists render as `""` (no
gap-collapsing, consistent with `formatFullName`).

```mermaid
flowchart LR
    A["EventForm<br/>description · type · invitees"] --> B[createEvent / updateEvent]
    B --> C["getSettings<br/>event_title_template + name_template"]
    B --> D["getUsersByIds + department names"]
    A --> E[buildGcalEventInput]
    C --> E
    D --> E
    E --> F["formatEventTitle (pure)"]
    F --> G["Google event summary<br/>+ notes.title = raw input"]
```

- **Schema** — migration `0008` adds `settings.event_title_template` (`text`, `NOT NULL`,
  default `'{description}'`), so existing rows and the bootstrap insert fall back to the
  plain description.
- **Formatter** — new pure `formatEventTitle(input, template)`: people arrive pre-resolved
  as `{ full, acronym, fqn }` per person, so the formatter is pure string substitution
  (token regex handles `{token}` and `{token:style}`). Unit-tested
  (`formatEventTitle.test.ts`, 12 cases).
- **Validation** (`src/lib/settings/validate.ts`) — `validateEventTitleTemplate`
  (non-empty after trim, ≤ 200 chars); `EVENT_TITLE_PLACEHOLDERS` drives the insert
  chips. 4 new cases in `validate.test.ts`.
- **Settings** — `getSettings()` returns `eventTitleTemplate`; new
  `updateEventTitleTemplate` server action (mirror of `updateNameTemplate`:
  `requireAdmin`, validate, `UPDATE settings`, audit `settings.update` with a diff,
  `revalidatePath("/settings/templates")`).
- **Round-trip fix** — the raw description is now stored in the notes JSON
  (`notes.title`; `parseEventTitle` in `src/lib/events/notes.ts`), so editing an event
  prefills the form with the _original_ text, not the rendered calendar title. Legacy
  events (no `notes.title`) fall back to the existing summary and are backfilled on
  first edit. `CalendarEventPayload.rawTitle` carries it to the client.
- **Events actions** (`src/lib/events/actions.ts`) — `createEvent`/`updateEvent` resolve
  the title context **once** per operation: invited people (name / shortname / FQN via
  the saved display-name template, using new `getUsersByIds()` in `src/lib/roster/queries.ts`),
  the event type's shortname (via `getEventTypesByNames()`), plus department names;
  `buildGcalEventInput` then renders the Google `summary` via the template. A template
  that renders to empty falls back to the raw description, so an event is never titled
  with an empty string. All department copies of one logical event share the same
  rendered title.
- **UI** (`src/app/(protected)/settings/templates/`, moved from General in Phase 2p) —
  "Event Title Template" card: input with insert-at-cursor chips for the eight tokens,
  hint lines explaining the type and people styles, and a live preview of a sample
  event (description "Team offsite" + first event type + up to two real users as
  invitees + their departments) that re-renders as the admin types.
- **Scoping** — only newly created/edited events re-render; existing Google summaries are
  untouched (legacy events lack the raw fields, so a bulk back-render isn't feasible).
  Changing the template does not rewrite past events.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (146), `pnpm build`, and
  `pnpm db:generate` (no drift — migration `0008` in sync) all pass.

## 1.24 Event type acronym + Templates tab (Phase 2p)

Two follow-ups to the template work: event types gain a required shortname acronym (like
users) that the event title template can render, and the two template cards move out of the
General tab into a dedicated **Templates** tab.

- **Event type shortname** — event types gain an app-required, unique `shortname` acronym,
  mirroring `users.shortname` (DB-nullable + unique index `event_types_shortname_idx`,
  migration `0009`; the app requires it). `validateEventTypeForm` flags a blank shortname;
  `createEventType`/`renameEventType` persist and audit it, and the unique-violation catch
  routes by constraint so a duplicate shortname errors on the shortname field. The
  `EventTypeForm` modal adds a required Shortname input; `EventTypeTable` cards show the
  shortname as a muted line under the name.
- **`{type:acronym}` token** — `formatEventTitle()` now takes the event type as
  `{ name, acronym } | null`: bare `{type}` renders the name and `{type:acronym}` the
  shortname (falling back to the name when blank), so `{type}` behaves as before.
  `EVENT_TITLE_PLACEHOLDERS` gains `"{type:acronym}"` (eight chips). `createEvent`/
  `updateEvent` resolve the shortname once per operation via new `getEventTypesByNames()`
  in `src/lib/eventTypes/queries.ts` (unknown names fall back to the name).
- **Templates tab** — the two template cards ("Display Name Template", "Event Title
  Template" — every word capitalized) move from `settings/general/` into a new
  `/settings/templates` route (`page.tsx` + `TemplatesForm.tsx` + `loading.tsx`) inserted
  into `SettingsTabs` before General. The General tab keeps only the login keyword card.
  `updateNameTemplate`/`updateEventTitleTemplate` now `revalidatePath("/settings/templates")`;
  `updateKeyword` still targets `/settings/general`. Preview data (first 5 users + event
  type names/shortnames) is fetched by the templates page.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (151), `pnpm build`, and
  `pnpm db:generate` (no drift — migration `0009` in sync) all pass; build route list shows
  `/settings/templates`.

## 1.25 Schedule view space optimization (Phase 2q)

The Schedule view (`ResourcesDayView`) reserved the most horizontal room of any dashboard
view: its two left columns — the group header (only when ≥2 departments are selected) and the
resource label — consumed 80px + 120px of a ~390px-wide phone before a single time slot
began. This phase compresses that gutter from 200px (multi-dept) / 120px (single-dept) down to
72px / 48px by showing acronyms instead of full names, dropping the department-row text, and
rotating the group header. No data is lost — full names remain available as tooltips.

```mermaid
flowchart LR
    before["Before (multi-dept)<br/>group 80px<br/>label 120px<br/>full names + dept text"]
    after["After (multi-dept)<br/>group 24px rotated<br/>label 48px<br/>acronyms + dept icon"]
    before -- "vars + render fns" --> after
```

- **Data** (`src/lib/events/schedule.ts`) — `ScheduleUser` carries `shortname`;
  `ScheduleResource` gains `fullName` (the display name used for tooltips/aria).
  `buildScheduleResources` now labels user rows `shortname || name` (same fallback as the
  `{people:acronym}` title token) and sets `fullName` to the full name; department rows keep
  `label = fullName = dept.name`. `dashboard/page.tsx` passes `shortname` through from
  `listUsers()`.
- **Narrow columns** (`DashboardView.tsx`) — a `vars` resolver overrides the `ResourcesDayView`
  root CSS vars: `--resources-day-view-resource-label-width` `7.5rem → 3rem` (48px) and
  `--resources-day-view-group-label-width` `5rem → 1.5rem` (24px). A `styles` override zeroes
  the label cell's horizontal padding and adds ellipsis truncation so a long acronym can't
  push a row.
- **Department row = icon only** — `renderResourceLabel` renders a bare `IconBuilding`
  (size 16) for department rows, carrying the department name as `title` + `aria-label`.
- **User row = acronym** — user rows render `row.label` (the shortname, falling back to the
  full name when unset) in a `sm` `Text`, with a `title` tooltip showing `fullName` only when
  it differs from the label (no redundant tooltip for name-fallback rows).
- **Rotated group header** — `renderGroupLabel` renders the department name in a
  `writing-mode: vertical-rl` span so it reads top-to-bottom down the 24px column; Mantine's
  built-in `translateY` vertical centering within the group block is preserved.
- **Corner cleanup** — `labels={{ resources: "" }}` hides the "Resources" corner text, which
  no longer fits the narrowed corner.
- **Skeleton** — `ScheduleGridSkeleton`'s per-row label block goes 88px → 48px to track the new
  column width.
- **Mantine 9.5.1 gotcha (verified in the installed package)** — the `vars` prop is a
  **resolver function** (`(theme, props, ctx) => ({ styleName: { "--css-var": value } })`),
  not a static object (a static object fails typecheck: `'styleName' does not exist in type
'PartialVarsResolver<…>'`). Var values are the full kebab-case CSS variable names, applied as
  inline styles on the root element, overriding the component's own CSS-var defaults.
  `renderResourceLabel`/`renderGroupLabel` receive Mantine's `ScheduleResourceData`, so app
  fields are read via `resource as ScheduleResource` (a safe downcast — the source array is
  `ScheduleResource[]`).
- **Tests** — `schedule.test.ts` fixtures gain `shortname`; new cases assert acronym labels,
  the `shortname → name` fallback, `fullName` passthrough, and that sort order is by name (not
  shortname). 12 → 13 cases.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (152), and `pnpm build` all pass;
  `pnpm db:generate` shows no drift (no schema change).

## 1.26 Git history

```
c2e1a68 Document Vercel Corepack requirement and env setup
d914aca Fix pnpm build scripts and pin package manager/Node
e04140f Phase 1 scaffold
8e60883 Initial commit from Create Next App
```

## 1.27 Event time options + calendar preview (Phase 2r)

Admins now choose which datetime expressions are allowed per event type, the event
form is reordered to match, and the final Google Calendar title is previewed live
above the submit button.

```mermaid
flowchart LR
    A[Event Types settings<br/>checkboxes] --> B[event_types.time_options<br/>range · full]
    B --> C[EventForm tabs]
    C --> D["Start &amp; End<br/>two datetime pickers"]
    C --> E["Full Day<br/>start date + AM/PM ·<br/>end date + AM/PM"]
    D --> H["title (timed)"]
    E --> G["title + (AM)/(PM)<br/>only when start & end match"]
    H --> J["Google Calendar summary<br/>+ preview in form"]
    G --> J
```

- **Time options** — each event type carries a `time_options` text-array column
  (migration `0010`) holding a subset of `["range", "full"]` (labels **Start &
  End**, **Full Day**). Empty/unrecorded types resolve to `["range"]` (the old
  behaviour). `src/lib/events/timeOptions.ts` is a pure module
  (`TimeOption`, `TIME_OPTION_LABELS`, `normalizeTimeOptions`,
  `resolveTimeOptions`, `resolveTimeOption`, `amPmSuffix`) unit-tested in
  `timeOptions.test.ts`.
- **Admin UI** — `EventTypeForm` gains a "Time options" `Checkbox.Group`
  (at least one required, validated in `validateEventTypeForm`);
  `createEventType`/`renameEventType` persist + audit it (field diff);
  `EventTypeTable` cards list the enabled option labels. `listEventTypes`
  returns normalized options; `getEventTypesByNames` also returns them so
  actions can enforce the restriction.
- **Event semantics** — `EventFormValues` drops the free `allDay` toggle and gains
  `timeOption`, `startAmPm` and `endAmPm`. `Start & End` is always timed (two
  `DateTimePicker`s). **Full Day** (the merged AM/PM + Full Day option) is a
  full-day event with **start date + AM/PM selector and end date + AM/PM
  selector**; the title gets `" (AM)"` or `" (PM)"` appended only when both
  indicators match (`amPmSuffix` — AM→AM or PM→PM), while mixed spans (AM→PM,
  PM→AM) render no suffix. `allDay` is derived server-side
  (`timeOption !== "range"`) in `buildGcalEventInput`, which also writes
  `timeOption`/`startAmPm`/`endAmPm` into the notes JSON (`notes.ts` parses them
  back via `parseEventTimeOption`/`parseEventStartAmPm`/`parseEventEndAmPm`;
  `CalendarEventPayload` gains `timeOption` + `startAmPm` + `endAmPm`). Legacy
  all-day events default to `"full"` on edit prefill with `AM`/`PM` indicators
  (rendering a plain full day). The server clamps the chosen option against the
  type's allowed set (`resolveEventTime`), defaulting untyped events to `range`.
  Chronological validation folds the indicator into the sort key
  (`YYYY-MM-DD AM` < `YYYY-MM-DD PM`), so a same-day PM→AM span is rejected.
- **Event form reorder** — order is now **Event Description → Event Type →
  time-option tabs → datetime component → Invitees → Calendar preview →
  Create/Save button**. When the selected type allows several options an inline
  `Tabs` strip switches the datetime component (switching to Full Day normalizes
  times to `00:00:00` and defaults the indicators to AM/PM — a plain full day);
  a single allowed option renders it directly; no type selected = Start & End.
- **Calendar preview** — a `Paper` above the submit button renders the exact
  summary the server will write: `formatEventTitle(...)` against the saved
  `event_title_template` using the live title/type shortname/selected people
  (fqn + acronym)/departments, plus the `(AM)`/`(PM)` suffix. `dashboard/page.tsx`
  passes the template, rich event-type info, and user `shortname` for the
  preview.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (175), `pnpm build`,
  and `pnpm db:generate` (no drift — migration `0010` in sync) all pass.

## 1.28 Calendar user filter (Phase 2s)

The `/dashboard` filter dialog gains a **Users** group for narrowing the calendar to specific
people, plus a one-tap **"Only me"** quick action beside the group label. The selection
persists in the URL as `?users=<id1,id2>` (same pattern as `cal`/`types`) and the filtering
runs server-side in `fetchMonthEvents`, so every view (Month, Mobile, Agenda, Day/Schedule)
renders the same filtered event set.

```mermaid
flowchart LR
    A["Filter dialog<br/>Calendars · Users · Event Types"] -->|"Only me" toggle| B["?users=&lt;currentUserId&gt;"]
    A -->|Apply| C["?cal= · ?types= · ?users="]
    C --> D["dashboard page<br/>validate ids against listUsers()"]
    D --> E["fetchMonthEvents<br/>userFilter"]
    E --> F["eventMatchesUserFilter (pure)<br/>creator ∈ S or tagged ∩ S"]
    F --> G["all dashboard views<br/>(rows unchanged)"]
```

- **Matching (decision)** — an event applies to a selected user when that user **created** it or
  is **tagged** on it (`createdBy` / `inviteeUsers` in the notes JSON) — the same people scope
  as the schedule view's personal rows. Department-tagged events do **not** match; they remain
  reachable via the calendar filter.
- **Pure helper** (new `src/lib/events/userFilter.ts`) — `eventMatchesUserFilter({ creatorId,
inviteeUserIds }, selectedUserIds)`, I/O-free, unit-tested in `userFilter.test.ts`
  (7 cases).
- **Query** (`src/lib/events/queries.ts`) — `fetchMonthEvents` takes `userFilter: string[]`
  alongside `typeFilter` and skips non-matching copies in the per-calendar loop. All copies of
  a logical event share identical people notes, so per-copy filtering is equivalent to
  post-dedupe filtering.
- **Page** (`dashboard/page.tsx`) — parses the `users` param (comma list) and drops ids absent
  from `listUsers()` (same treatment as `cal`/`types`); absent param = no filter. Passes
  `selectedUserIds` to `DashboardView`.
- **FilterModal** (`src/components/FilterModal.tsx`) — `FilterGroup` gains an optional generic
  `action?: { label, icon?, isApplied, apply }`, rendered as a small toggle button beside the
  group label (`variant` flips `default` ↔ `light` in the accent color when applied). The
  action callback receives a draft-value setter plus the current/all option values. `UserTable`
  passes no actions, so its behavior is unchanged.
- **Users group** (`DashboardView.tsx`) — options come from the role-scoped `inviteeUsers`
  (admin → all active users; regular user → own department) with display-name labels; the group
  is hidden when empty. The **Only me** action (hidden when the current user is not among the
  options) toggles the group draft between `[currentUser]` and "all selected" (which the
  dialog normalizes to "no filter" on Apply, so `?users` clears on toggle-off).
  `activeFilterCount` — and hence the Filters badge — counts the Users group whenever a subset
  is applied.
- **Scope (decision)** — the filter selects which **events** render only; the schedule view's
  resource rows are unchanged. Existing URL behavior is untouched (params stay shareable; a
  user opening a shared `?users=` link can only see events they could already see).
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (193), `pnpm build`, and
  `pnpm db:generate` (no drift — no schema change) all pass.

## 1.28 Admin events on behalf of another user (Phase 2s)

Admins can now **create and edit events on behalf of any user**: a user picked in a
new "On behalf of" selector becomes the event's creator (stored as `createdBy` in the
notes block). The acting user is locked as an invitee (her department becomes a target
calendar; she renders in the schedule row and in `{people}` title tokens). On edit the
selector prefills the current creator and the admin may reassign it; the previous
creator stays tagged unless manually removed.

- **UI** (`src/app/(protected)/dashboard/EventForm.tsx`) — new `isAdmin` prop. Admins
  see a required `Select` "On behalf of" (options = all active users, `displayName`
  via the name template) bound to `creatorId`; non-admins see nothing. On create the
  admin's `creatorId` starts empty; regular users still default to their own id. The
  locked creator invitee chip is derived from `form.values.creatorId`, so it tracks the
  acting user on every change. `validateEventForm` is called with
  `{ requireCreator: isAdmin }` so an unset creator blocks submission with a field
  error on the selector.
- **Validation** (`src/lib/events/validate.ts`) — `validateEventForm(values, opts?)`
  gains `opts.requireCreator`; when set, a blank `creatorId` returns
  `errors.creatorId`. `EventFormErrors` gains `creatorId?`. Unit-tested (2 new cases).
- **Actions** (`src/lib/events/actions.ts`) — `createEvent`/`updateEvent` pass
  `{ requireCreator: role === "admin" }` (server-side enforcement of the required
  creator) and a new `creatorGuard` authorizes the creator: admins may use any id;
  a non-admin may use only their own id, or (on update) the event's existing creator —
  so invited editors aren't blocked while forging is rejected. `EventResultField`
  (extracted from the union) now includes `"creatorId"` and the validate-failure return
  highlights the actual first field instead of hardcoding `title`.
- **Threading** — `isAdmin` flows `dashboard/page.tsx` → `DashboardView` → `EventForm`.
- **Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (186), `pnpm build`,
  and `pnpm db:generate` (no drift — no schema change) all pass. (Live smoke against a
  configured Google account still pending.)

## 1.29 Admin-id UUID guard fix

The virtual admin session id `"admin"` is not a `users` row (the admin authenticates via
the settings password hash) and is **not a UUID** — but its `users.id` column is a
Postgres `uuid`. Admin create/delete passed `"admin"` into the `inArray(users.id, [...])`
lookup behind target-calendar and title resolution, crashing with
`invalid input syntax for type uuid: "admin"` (a 500) before any Google call.

- **Root cause** — `src/lib/auth.ts` `authorize` returns `{ id: "admin" }` for the admin
  password login. `createEvent`/`deleteEvent` → `resolveTargetCalendars` →
  `getUserDepartmentIds(["admin", <uuid>, …])`; the same latent bug existed in
  `buildEventTitleContext` → `getUsersByIds`.
- **Fix** — new pure `src/lib/uuid.ts`: `isUuid(value)` (canonical regex) and
  `onlyUuidIds(ids)` (filter). Both `getUserDepartmentIds`
  (`src/lib/events/queries.ts`) and `getUsersByIds` (`src/lib/roster/queries.ts`) now
  filter to UUID ids before the query, so `"admin"` resolves to no department/no user
  rather than crashing. Unit-tested (`src/lib/uuid.test.ts`, 4 cases). Later phases
  build on this: the admin's virtual id is superseded by the "on behalf of" acting-user
  selection (Phase 2s).

## 1.30 Empty event title (Phase 2t)

The event form's **Event Description** is now **optional**: an event may be created or
edited with no description, in which case the Google Calendar summary is whatever the
event title template renders on its own (type/people/departments) — and if the template
also renders nothing, the event is genuinely untitled (shown as `"(no title)"` in the
dashboard, which `fetchMonthEvents` already handled).

- **Validation** (`src/lib/events/validate.ts`) — the "Description is required" check is
  gone; `EventFormErrors.title` removed. The form `TextInput` drops `required` and gains a
  hint: "Optional — the calendar title is rendered from the title template".
- **Suffix guard** (`src/lib/events/actions.ts` `buildGcalEventInput`, mirrored in the
  `EventForm` preview) — the `(AM)/(PM)` full-day suffix is appended only when the title
  base is non-empty, so a titleless event never becomes a bare `"(AM)"` summary. The
  preview now also trims the raw fallback, matching the server.
- **Notes round-trip** (`src/lib/events/notes.ts`) — an empty description must survive
  storage so the edit form doesn't prefill the _rendered_ template title as the
  description: `encodeEventNotes` keeps `title: ""` (an exception to its blank-stripping)
  and `parseEventTitle` returns `""` for it (null only for legacy events without the
  field). The form prefill (`rawTitle ?? …`) then correctly restores `""`.
- No schema/Google-transport changes (`events.update` is a full replace, so an empty
  summary clears the title on edit). Audit `entityName` is simply `""` for such events.
- Verification: `pnpm test` (195), `pnpm typecheck`, `pnpm lint` all pass; no schema
  change, `pnpm db:generate` drift-free.

## 1.31 Google Calendar "Edit in app" link (Phase 2u)

Google Calendar event notes now carry a clickable link that takes the user to the app and
opens the event's edit form. The machine JSON block is still stored in the notes
(`description`) — a short `Edit: <url>` line now sits **above** it, which Google
Calendar linkifies automatically. The URL encodes everything the app needs to find the
event again: `<origin>/dashboard?date=<start-date>&edit=<event group id>`.

```mermaid
sequenceDiagram
    participant U as User (phone)
    participant G as Google Calendar
    participant L as /login
    participant D as /dashboard

    Note over D: create/edit event in the app
    D->>G: event notes = "Edit: <url>" line + JSON block
    U->>G: taps the link in the notes
    G->>D: GET /dashboard?date=YYYY-MM-DD&edit=EVENT_ID
    alt no session
        D->>L: NextAuth redirect (credentials)
        L-->>D: back to the same URL after login
    end
    D->>D: resolve the event by group id in the fetched month
    D-->>U: edit form opens (or dismissable "could not open" alert)
```

- **Notes format** (`src/lib/events/notes.ts`) — new `editLink` field; pure helpers
  `eventEditUrl(baseUrl, start, eventId)` (builds the dashboard link, date from the naive
  start) and `withEditLink(notesJson, url)` (places the `Edit:` line above the JSON
  block). `parseEventNotes` first tries the whole string (legacy events unaffected), then
  scans from the bottom for the last line that parses as a JSON object — the block is
  always a single line (`JSON.stringify`) and the line above it never contains braces, so
  every reader (queries, `findCopies`) keeps working through that one entry point.
- **Origin** (new `src/lib/appUrl.ts`) — `appBaseUrl()` derives `<proto>://<host>` from
  the incoming request headers (`x-forwarded-proto`, `http` fallback), the same pattern as
  the audit logger; no new env config.
- **Write path** (`src/lib/events/actions.ts`) — `buildGcalEventInput` is now async and
  writes `editLink` into the notes plus the `withEditLink` wrapping on **every**
  create/edit, so the in-notes link stays current when a date changes in the app.
- **Deep link** (`src/app/(protected)/dashboard/`) — the page validates `?edit=` with
  `isUuid` (anything else ignored) and passes `initialEditEventId`; `DashboardView`
  resolves the target synchronously at mount (the month is already fetched server-side)
  and initializes state directly — the edit form opens with the event, or a dismissable
  "Could not open that event" alert is shown when the event isn't in the current calendar
  selection/month. A one-shot effect strips `?edit=` from the URL (refresh won't reopen
  the form); `navigate` was stabilized with `useCallback` to satisfy the React-19-era
  `set-state-in-effect` and `exhaustive-deps` lint rules.
- **Edge cases** — rescheduling the event **in** Google Calendar (outside the app) leaves
  a stale date in the stored link → the "could not open" alert; an in-app edit rewrites
  it. Clicks without a session go through the normal NextAuth redirect and return to the
  same URL. No permission change: the dashboard fetch stays scoped to the user's normal
  calendar selection and `creatorGuard` still applies on save.
- **Tests** (`src/lib/events/notes.test.ts`) — 8 new cases: `withEditLink` placement/empty
  cases, `eventEditUrl` with/without a date, parsing the new format (round trip including
  `editLink`), braces inside `title`, and the field-level parsers on the new format.
- **Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (203), `pnpm build`, and
  `pnpm db:generate` (no drift — no schema change) all pass. Live confirmation that Google
  Calendar linkifies the stored URL remains pending until service-account credentials are
  configured (verify with a disposable test event).

## 1.32 Compressed opaque notes block (Phase 2v)

The machine notes block in Google notes no longer exposes raw JSON: below the
human-readable `Edit: <url>` line it is now **brotli-compressed and base64url-encoded
(no padding) on a single line**. Notes get short — the block itself measured ~585 → ~220
chars on a worst-case event (3 invitees, a department, a long title) — and calendar
viewers no longer see raw group/user uuids, event-type names, or the typed description.
The block's content is still a JSON object, so adding fields stays migration-free. The
redundant `editLink` field stored inside the JSON was dropped — the URL the top line
already shows no longer duplicates inside the block.

```mermaid
flowchart TB
    A[notes object] --> B[encodeEventNotes → JSON]
    B --> C[brotliCompressSync]
    C --> D[base64url, no padding]
    D --> E["notes text: Edit: url, blank line, block"]
    E --> F[parseEventNotes]
    F --> G{whole string one JSON?}
    G -- "v1 legacy" --> H[(EventNotes)]
    G -- no --> I[scan lines bottom-up]
    I --> J{"line a raw JSON object? (v2)"}
    J -- yes --> H
    I --> K{"base64url → brotli or gzip → JSON? (v3)"}
    K -- yes --> H
```

- **Writer** (`src/lib/events/notes.ts`) — new `encodeNotesBlock(json)`:
  `zlib.brotliCompressSync` → `toString("base64url")`. Deterministic (fixed compressor
  settings, no timestamp), so the same JSON always yields the same single line.
  `withEditLink` now just places the human line above an arbitrary block line.
- **Reader** (`src/lib/events/notes.ts`) — `parseEventNotes` keeps the whole-string JSON
  path (v1) and its bottom-up line scan now accepts each line as (a) a raw JSON line
  (v2) or (b) a base64url line that inflates to a JSON object — **brotli first** (the
  current writer) with a **gzip fallback** inflate, so a future codec switch can never
  strand stored events. Node's `base64url` decoder also accepts the standard `+/`
  alphabet and padding, so either spelling decodes. Every field parser
  (`parseEventPeople`, `parseEventTitle`, …) funnels through this one entry point — no
  changes needed anywhere else.
- **Write path** (`src/lib/events/actions.ts`) — `description =
  withEditLink(encodeNotesBlock(encodeEventNotes(…)), editLink)`; `editLink` is no
  longer a notes field (the v3 block stores it nowhere).
- **Debug one-liner** — decode a stored block (the last line of the notes) with
  `echo "<block>" | base64 -d | brotli -d` (or `| zcat` if it was ever gzip-compressed).
- **Tests** (`src/lib/events/notes.test.ts`) — v3 round trip (incl. braces in `title` and
  the field-level parsers), gzip fallback decode, v1/v2 legacy cases kept, single
  base64url line shorter than the raw JSON, determinism, and null for an undecodable
  line. Notes suite: 35 tests.
- **Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (208), `pnpm build`, and
  `pnpm db:generate` (no drift — no schema change) all pass.

## 1.33 Searchable user filter (Phase 2w)

The dashboard filter dialog's **Users** group no longer renders one checkbox card per user
(unusable as the roster grows toward 100). It now renders a **searchable dropdown** — the
same pattern as the event form's invitees `MultiSelect` — with the same role-scoped options
(admins: every active user; regular users: their own department).

- **`FilterModal` (`src/components/FilterModal.tsx`)** — `FilterGroup.variant` accepts
  `"grid"` (default, unchanged) or `"search"`. Search groups render a Mantine `MultiSelect`
  (`searchable` + `clearable`, placeholder `All <group>`) and use **empty = no filter**
  semantics (grid groups keep "all selected = no filter"), so narrowing 100 options down to
  a few never requires unticking the rest. Draft initialization, the no-clear-to-empty guard
  (grid only), `Clear`, `Apply` normalization (all selected → `[]`, plus empty for search),
  and the active-filter check all branch on the variant.
- **`DashboardView`** — the Users group sets `variant: "search"`; the "Only me" quick
  action now toggles between `[currentUser]` and `[]` (empty) instead of the full list.
  The `?users=` URL state, `fetchMonthEvents` user filtering, and the Filters button badge
  are unchanged (they already treat an empty list as "no filter").
- Settings' Users table filter (small Status/Department grid groups) is unaffected.
- **Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (208), `pnpm build`, and
  `pnpm db:generate` (no drift — no schema change) all pass.

## 1.34 PWA installability (Phase 3a)

Cloudy is now installable as a **Progressive Web App** (App Router + Serwist for Turbopack).
Scope is deliberately **installability + app shell only**: all data (events, users, filters)
is fetched live from the Google Calendar + Neon DB on every operation, and the service worker
**never serves cached data** — a `NetworkOnly` catch-all covers pages, RSC payloads, auth, and
any future `/api/*`. Only immutable static build assets (fonts, images) are cached for a fast
cold start. No push notifications (deferred — needs VAPID + a push backend).

```mermaid
flowchart LR
    U[User taps installed icon] --> SW[Service worker]
    SW -->|immutable static assets| C[(CacheFirst)]
    SW -->|pages / RSC / auth / api| N[Network only]
    N --> DB[(Neon DB)]
    N --> GC[Google Calendar]
```

- **Manifest** (`src/app/manifest.ts`) — `display: standalone`, portrait, theme
  `#0D47A1` / background `#FBC02D`, icons 192/512 + maskable 512. Served at
  `/manifest.webmanifest`.
- **Layout metadata** (`src/app/layout.tsx`) — `metadata.manifest`,
  `appleWebApp` (capable, `black-translucent`, title), `formatDetection` off,
  `viewport.themeColor = #0D47A1`, and the `apple-touch-icon` link (180px). The root
  layout wraps children in `SerwistProvider` from `@serwist/turbopack/react`, which
  registers the SW with `updateViaCache: "none"` (critical on iOS).
- **Next config** (`next.config.ts`) — wrapped with `withSerwist` from
  `@serwist/turbopack`. The Turbopack setup serves the compiled SW via a **route
  handler** at `src/app/serwist/[path]/route.ts` (`createSerwistRoute`, `swSrc:
  src/app/sw.ts`) → `/serwist/sw.js`, instead of emitting `public/sw.js`.
- **Service worker** (`src/app/sw.ts`) — Serwist with `precacheEntries`,
  `skipWaiting`, `clientsClaim`, `navigationPreload`, and explicit `runtimeCaching`:
  `CacheFirst` for fonts/CSS, `StaleWhileRevalidate` for images, and **`NetworkOnly`
  for every same-origin request** (the app's default `defaultCache` would cache
  `/api` + RSC with NetworkFirst, which this app must not do).
- **Icons** (`public/`) — generated from `icon.svg`/`icon-maskable.svg` (brand
  calendar mark): `icon-192x192.png`, `icon-512x512.png`, `icon-maskable-512x512.png`,
  `apple-touch-icon.png`.
- **Dependencies** — `@serwist/turbopack`, `serwist`, `esbuild` (dev). Also fixed a
  leftover placeholder in `pnpm-workspace.yaml`: `@swc/core` build must be allowed
  (`true`) or install/typecheck fail.
- **Verification** — `pnpm build` bundles the SW ("50 precache entries"), and
  `pnpm lint` / `pnpm typecheck` / `pnpm test` (220) / `pnpm db:generate` (no drift —
  no schema change) all pass. Local smoke test: `/manifest.webmanifest` → 200
  `application/manifest+json`; `/serwist/sw.js` → 200 `application/javascript`; `/login`
  HTML contains the SW registration + manifest link. Manual device checks remaining:
  iOS "Add to Home Screen" standalone launch, Android install prompt.

## 1.35 Touch-friendly input heights (Phase 3b)

All single-line inputs (text boxes and dropdowns) are now **1.2× taller** so they are
comfortable to tap on a touchscreen. Mantine 9 no longer exposes the old
`theme.variants.input.inputHeight` option — input heights are driven by
`--input-height-{size}` CSS variables on the input's wrapper element. The scale is
therefore applied once in the theme: a `components.Input.vars` override that every
input-family component inherits, because they all render on the base `Input` and
resolve their styles under the name `["Input", <component>]`.

```mermaid
flowchart TB
    T["theme.components.Input.vars → wrapper<br/>--input-height-{xs,xl} × 1.2"] --> I[Input wrapper]
    I --> TI[TextInput]
    I --> PI[PasswordInput]
    I --> S[Select]
    I --> MS[MultiSelect]
```

New heights (Mantine default → after 1.2×):

| size | before | after |
| --- | --- | --- |
| `xs` | 30px | 36px |
| `sm` (app default — every input uses it) | 36px | 43.2px |
| `md` | 42px | 50.4px |
| `lg` | 50px | 60px |
| `xl` | 60px | 72px |

- **Theme** (`src/lib/theme.ts`) — new `components.Input.vars` sets the wrapper's
  `--input-height-{xs,sm,md,lg,xl}` to `calc(<base> × 1.2 × var(--mantine-scale))`
  (2.25 / 2.7 / 3.15 / 3.75 / 4.5rem). The derived values adapt automatically: input
  `line-height`, inline padding (`height / 3`), and the left/right section size — the
  chevron box of `Select`/`MultiSelect` stays roughly square at the new height.
- **Provider move (required by the theme change)** — the theme now carries a function
  value, and React Server Components cannot pass functions to client components: keeping
  `MantineProvider theme={theme}` in the server root layout made every page 500 with
  `Functions cannot be passed directly to Client Components`. The provider now mounts on
  the client via a new `AppProviders` component (`src/components/AppProviders.tsx`,
  `"use client"`) that renders `MantineProvider` + `Notifications`; the server layout
  passes `children` into it (children stay server-rendered — only the provider's own
  props cross the boundary). `AGENTS.md` documents the constraint.
- **Login form** (`src/components/LoginForm.tsx`) — the local `1.5×` height hack on the
  login `PasswordInput` (`styles={{ input: { height: "calc(var(--input-height) * 1.5)" } }}`)
  was removed; the field now matches the global 1.2× scale (locked-in by request).
- **Scope** — covers `TextInput`, `PasswordInput`, `Select`, and `MultiSelect`; any
  future `@mantine/dates` input extends `Input` the same way and is covered too.
  Untouched: the heights of items inside an opened dropdown list, buttons, and
  `Textarea`s (auto height, rows-based).
- **Verification** — `pnpm lint`, `pnpm typecheck`, and `pnpm test` (220) pass. Dev
  server (Turbopack): `/login` returns 200 and its SSR HTML shows the wrapper inline
  style `--input-height: var(--input-height-sm); --input-height-sm: calc(2.7rem *
  var(--mantine-scale))` — i.e. 43.2px = 36px × 1.2 with `--mantine-scale: 1`; every
  other input consumes the same base-`Input` vars. `pnpm build` not run locally (a dev
  server held `.next`); CI's build job covers it. No schema change —
  `pnpm db:generate` shows no drift.

## 1.36 Global bottom nav + Overview page (Phase 3c)

The app now has a **global bottom navigation bar** on every protected page (the Phase 2e
bar was removed in 2f in favor of the profile-icon-only settings hub; this restores it as
the app's primary navigation) and a new **Overview** page that answers "how many events of
each type did each person have this month".

```mermaid
flowchart LR
    A[AppShell.Footer<br/>global bottom nav] --> B[Calendar /dashboard]
    A --> C[Overview /overview]
    A --> D[Settings /settings<br/>admin only]
    D --> E[Settings sub-tab bar<br/>stacks above the global nav]
    C --> F["?month=YYYY-MM<br/>server fetch"]
    F --> G[Google Calendar events]
    G --> H[buildOverviewCounts<br/>pure per-user × per-type counts]
    H --> I[OverviewView matrix]
```

- **Bottom nav** (`src/components/AppShellShell.tsx`) — `AppShell.Footer` (height 56px +
  `env(safe-area-inset-bottom)`) with icon + label tabs: **Calendar** (`/dashboard`,
  `IconCalendarMonth`), **Overview** (`/overview`, `IconChartBar`), **Settings**
  (`/settings`, `IconSettings`, admins only — non-admins get just the first two). Active
  state via `pathname.startsWith(href)`, brand-colored icon/label, `aria-current="page"`.
- **Clearance constants** (`src/lib/bottomNav.ts`) — `BOTTOM_NAV_HEIGHT` (56),
  `BOTTOM_NAV_HEIGHT_CSS`, and `BOTTOM_NAV_FLOATING_OFFSET`. The `FloatingToolbar`
  default `bottomOffset` now clears the nav, so the dashboard "New event" FAB and the
  minimized-form pill are no longer hidden behind it; the Settings sub-tab bar
  (`SettingsTabs`) sits at `bottom: BOTTOM_NAV_HEIGHT_CSS` (its own safe-area padding
  removed — the nav below owns it) and `SETTINGS_TAB_BAR_OFFSET` grew to
  `calc(108px + env(safe-area-inset-bottom) + 16px)` (52px sub-tab bar + 56px nav) so the
  Settings floating buttons stay clear.
- **Overview page** (`src/app/(protected)/overview/`) — month header (‹ / `MMMM YYYY` /
  › / Today, navigating `?month=`), then a horizontally scrollable CSS-grid matrix inside
  a `Paper` (no `<Table>`): one column per configured event type (zeros included), one
  row per **active** user by display name, with a **sticky first column**. Role scoping
  mirrors the dashboard: admins see all departments/users, regular users only their own
  department's. Loading skeleton in `loading.tsx`; "Google not configured" and empty
  states included.
- **Counts** (`src/lib/overview/counts.ts` + `counts.test.ts`, pure + 9 unit tests) —
  `involvedUserIds` (creator ∪ tagged users, deduped) and `buildOverviewCounts` (per user
  per configured type). Input events are already deduped by logical group id
  (`fetchMonthEvents`), so a cross-department event counts once per involved user; events
  without a parseable type, or with a type no longer configured, are not represented
  anywhere (no total/aggregate column).
- **Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (238), and `pnpm build`
  all pass; build route list shows `/overview`. No schema change — `pnpm db:generate`
  shows no drift.

## 1.37 Overview cross-department filter fix (Phase 3d)

A non-admin who filtered Overview to a department **they are not in** while any users
filter was active (the "Only me" quick action, a picked user, or a stale `users=` param)
got the *"No users to show. Assign yourself to a department…"* card — the department
filter appeared not to apply.

```mermaid
flowchart TD
    A["?cal= / ?users= / ?types="] --> B[Server page]
    B --> C["cal -> rowUserIds (NEW pure helper)<br/>rows = users of selected departments"]
    B --> D["users/types -> fetchMonthEvents<br/>narrow events only"]
    C --> E[Matrix rows]
    D --> F[buildOverviewCounts]
    E --> G["OverviewView matrix"]
    F --> G
```

**Root cause** (`src/app/(protected)/overview/page.tsx`): matrix rows were computed as
`rowUsers ∩ selectedUsers`. A non-admin's users filter can only ever contain own-
department users (the dialog's Users options are role-scoped, and "Only me" always picks
the current user), so selecting another department intersected to `[]`. The dashboard
never had this because its schedule rows (`scheduleUsers`) follow the selected calendars
only — the `users` param filters **events** (`fetchMonthEvents` `userFilter`), never
rows.

**Fix** — match the dashboard semantics (user-confirmed):

- **New pure helper** `src/lib/overview/scope.ts` — `overviewRowUserIds(users,
  selectedCalendarIds, calendarCount, isAdmin, ownDepartmentId)`: active users only;
  narrowed calendar selection → users of the selected departments; otherwise the role
  default (admins: everyone incl. unassigned, non-admins: own department). No users
  input — the contract that `?users=` never narrows rows is enforced by the API shape.
  `scope.test.ts` adds 6 unit tests incl. the cross-department regression guard.
- **Overview page** — rows (count inputs + department grouping) come from the helper;
  the `rowUsers ∩ selectedUsers` intersection is gone. `fetchMonthEvents({ userFilter:
  selectedUsers })` and the `selectedUserIds` prop are unchanged, so the users filter
  still narrows the counted events and the filter dialog keeps its state/badge.
- No client changes — `OverviewView.tsx` and `FilterModal` untouched.

**Side effects (accepted):** admins who combined `cal` + `users` to hide rows now keep
the rows (counts of filtered-out events drop to 0); "Only me" on a foreign department
shows that department's rows with 0s (or real counts where the user is involved in
cross-department events).

**Repro that was wrong, now fixed** (live dev DB): Carol (dev-COU) with
`?cal=dev-CIU&users=<Carol>` rendered the empty-state card; now it renders the two
dev-CIU rows with 0 counts. Bob (dev-CIU) with `?cal=dev-COU` still shows the dev-COU
rows and events — the pure `cal` filter already worked and is unchanged.

**Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (244) pass; no schema
change. Live re-check of the full repro matrix (default / cross-dept / cross-dept +
users, both directions) against the dev server.

## 1.38 Cross-department user options in filter dialogs (Phase 3d)

After the §1.37 fix a non-admin could switch the **Calendars** filter to another
department and see that department's rows, but the filter dialog's **Users** group still
only listed **own-department** users — so "filter other departments and their users"
was impossible, on both the Overview and the Dashboard filter dialogs.

```mermaid
flowchart LR
    A["selected departments (?cal)"] --> B["rows in view<br/>(rowUserIds / scheduleUsers)"]
    B --> C["filterUserOptionIds<br/>NEW pure helper"]
    A2[current user] --> C
    C --> D["filter dialog Users options<br/>(selected dept users + self)"]
    D --> E["?users= -> fetchMonthEvents<br/>narrows events"]
```

**Root cause:** both pages fed the filter dialog's Users group from a **role-scoped**
user list — `overview/page.tsx` `inviteeUsers` (`isAdmin ? all : ownDept`) and
`dashboard/page.tsx` `pickerUsers` (the same list that also feeds the EventForm invitee
picker). The server already accepted any roster user id in `?users=`, so the option
list was the only blocker.

**Fix** (user-confirmed: both pages; creation picker stays role-scoped):

- **New pure helper** `src/lib/filters/filterUserOptions.ts` —
  `filterUserOptionIds(users, rowUserIds, currentUserId)`: returns the users in view
  (rows of the selected departments) **plus the current user** when it is in the roster
  but not already included — so "Only me" works on foreign departments and its chip
  renders a real label (a selected value absent from the option data would otherwise
  show as a raw uuid). 6 unit tests in `filterUserOptions.test.ts`.
- **Overview** — dialog options come from the new helper (rows = `overviewRowUserIds`
  result); the view prop is renamed `inviteeUsers` → `filterUsers`.
- **Dashboard** — a new `filterUsers` prop (rows = `scheduleUsers`) drives the filter
  dialog; `inviteeUsers` stays as the EventForm invitee picker (own-department scope
  for non-admins, per creation permission semantics) and `peopleNames`/creation flows
  are untouched.
- `progress.md` status bullet added.

**Behavior notes (accepted):** non-admin defaults are unchanged in practice
(own-dept users + self == previous options); admins keep all active users; an inactive
or unassigned self still appears so "Only me" works for filtering their own past
events.

**Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (250) pass; no schema
change. Live re-check on the dev server: Bob (dev-CIU) viewing dev-COU sees the six
dev-COU users (plus himself) in the Overview and Dashboard filter dialogs; picking one
filters events while rows stay department-wide; the EventForm invitee picker still
lists only Bob's own department.

## 1.39 Overview full-selection row scoping fix (Phase 3d)

After §1.37/§1.38, a non-admin filtering the **Overview** to a single foreign
department saw the right rows — but selecting **all** departments collapsed the matrix
back to their **own** department.

```mermaid
flowchart TD
    A["selected departments (?cal)"] --> B["overviewRowUserIds"]
    B --> C{"selection == all calendars<br/>and isAdmin?"}
    C -- yes --> D["every active user<br/>incl. unassigned"]
    C -- no --> E["users of the selected departments<br/>(dashboard parity)"]
```

**Root cause** (`src/lib/overview/scope.ts`): the old `overviewRowUserIds` used a
`narrowed` heuristic — `0 < selected.length < calendarCount` — as a proxy for "an
explicit filter is applied". When a non-admin selected **every** calendar,
`length < calendarCount` was false, so the helper fell back to the **role default**
(own department only). This conflated "no filter" (the role default) with "filtered to
everything"; the dashboard never had this problem because its `scheduleUsers`
(`dashboard/page.tsx`) always filters by the selected calendars.

**Fix** (dashboard parity):

- `overviewRowUserIds` no longer uses the length heuristic and drops the
  `ownDepartmentId` parameter: **any** selection narrows rows to the selected
  departments; the sole special case is `isAdmin && selection == all calendars`,
  which keeps unassigned users visible (the admin default view and an explicit full
  selection share the same code path). The page's `ownDepartmentId` remains — it still
  drives `defaultCalendars`.
- `scope.test.ts` updated (7 tests) with the regression guard: a non-admin selecting
  all departments gets every department's users, not their own.

Behavior matrix (unchanged cases verified): non-admin default (own dept), non-admin
single foreign department, non-admin unassigned with no calendars, admin subset
selection, admin default/full selection incl. unassigned.

**Verification** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (251) pass; no schema
change. Live re-check: Bob `/overview?cal=<CIU>,<COU>` now renders **both** departments
(dev-CIU 2 + dev-COU 6); `?cal=<COU>` and the default remain correct; the Dashboard
is unaffected.

## 1.40 Externally created events (Phase 3e)

Events can be created **outside** the app — directly in Google Calendar by a user with
calendar access. Those events have no app notes, so the app now tells them apart and
marks them as **external**.

```mermaid
flowchart TD
    A["Google event description"] --> B{"has 'Created in cloudy2' line?"}
    B -- yes --> C[internal]
    B -- no --> D{"has an app notes block?"}
    D -- yes --> C
    D -- no --> E["external (created in Google Calendar)"]
```

**Detection** (`src/lib/events/notes.ts`):

- `INTERNAL_EVENT_MARKER = "Created in cloudy2"` — a human-readable line the app writes
  at the **bottom** of every event description it creates or edits
  (`withInternalMarker`, called from `buildGcalEventInput` in `src/lib/events/actions.ts`
  after the `Edit:` link + compressed block). Idempotent, so re-edits never duplicate it.
- `isExternalEvent(description)` — external when the marker **and** a parseable notes
  block are both absent. The block clause keeps pre-existing in-app events (notes block,
  no marker yet) from showing as External until their next in-app edit.
- The marker sits below the opaque block, so `parseEventNotes`'s bottom-up scan still
  inflates the block correctly (no format change, no migration).

**Display**:

- `CalendarEventPayload` gains `external` (set in `fetchMonthEvents` from the
  description); titles are unchanged (no prefix).
- The event detail modal (`EventDetail.tsx`) shows a gray **External** badge next to the
  type/calendar badges. Edit/Delete remain available — editing an external event
  "adopts" it (rewrites notes + marker).
- **Day (schedule) view**: external events have no linked people, so `expandScheduleEvents`
  pins them to their own calendar's department row, and `buildScheduleResources` keeps a
  user-less department's row when it holds an external event.

**Out of scope:** external events have no event type, so the Overview matrix does not
count them (no column to put them in). No schema change — `db:generate` no drift.

**Verification** — `pnpm build/lint/typecheck/test` (262) pass; `db:generate` no drift.

## 1.41 Additional access levels (Phase 3f)

The **Additional access** section of a department's Share modal can now set the access
level (**Read only / Can edit / Owner** → Google ACL `reader` / `writer` / `owner`) when
granting a new share, and the level of an existing share can be changed later. Previously
every manual grant was hardcoded to `reader` and existing shares showed only the raw
Google role string.

```mermaid
flowchart LR
    A["Share modal<br/>email + access level Select"] --> B[grantDepartmentAccess]
    B --> C["setCalendarAccess(email, reader|writer|owner)"]
    A2["existing rule row<br/>level Select"] --> D[updateDepartmentAccess]
    D --> C
    C --> E["listDepartmentAccess (reconcile)"]
```

- **Domain** (`src/lib/roster/shares.ts`) — new `DepartmentAccessRole = "reader" |
  "writer" | "owner"` type and pure `isDepartmentAccessRole(value)` guard (rejects
  `freeBusyReader` and anything else). 2 unit tests added in `shares.test.ts`.
- **Actions** (`src/lib/roster/actions.ts`) — `grantDepartmentAccess(calendarId, email,
  role)` takes the role (validated server-side, replacing the hardcoded `"reader"`) and
  logs it in the audit `details`; new `updateDepartmentAccess(calendarId, email, role)`
  re-grants an existing rule's role via `setCalendarAccess` and logs it under a new
  `access.update` audit action (`AUDIT_ACTIONS.accessUpdate` in
  `src/lib/audit/build.ts`).
- **UI** (`src/app/(protected)/settings/departments/DepartmentShares.tsx`) — the add
  form gains an "Access level" `Select` (defaults to **Read only**) above the email
  row; each existing additional-access rule row now shows a human-readable role label
  (falling back to the raw role) plus a compact `size="xs"` `Select` to change the
  level, with a per-row loading state mirroring the Remove button.
- No schema change (`db:generate` no drift); the role is stored only in Google Calendar,
  matching the existing ACL-as-source-of-truth model. Assigned users and the admin owner
  stay auto-managed as `reader`/`owner` respectively.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (264), and `pnpm build` pass;
  `pnpm db:generate` shows no drift.

## 1.42 Calendar caching layer (Phase 3g)

The dashboard/overview pages rendered by re-hitting Google Calendar on **every** server
render — a serial `events.list` per selected department calendar per month, hidden behind
the loading skeleton. A server-side caching layer now sits between the frontend and the
Google Calendar API, backed by a Postgres table so it is shared across serverless instances
and survives restarts.

> **Why Postgres and not Next's `use cache` data cache?** The first implementation used
> `cacheComponents: true` + a `'use cache'` function, but Turbopack `next dev` crashed on
> **Node 26** with `TypeError: ArrayBuffer is not detachable and could not be cloned`
> (vercel/next.js#96165 — pooled `Buffer`s are non-detachable when enqueued into the dev
> RSC byte stream; unfixed, dev-only, production unaffected). It also forced PPR-style
> prerendering and an `export const instant = false` opt-out on protected routes. The DB
> table avoids the entire Next cache runtime and works identically in dev/CI/Vercel.

```mermaid
sequenceDiagram
    participant P as Page (RSC render)
    participant D as google_event_cache (Postgres)
    participant G as Google Calendar
    P->>D: getCachedMonthEvents(gcalId, month) per selected calendar
    alt fresh row (hit, <30s)
        D-->>P: decoded GcalEventItem[]
    else stale row (30s–30min)
        D-->>P: decoded GcalEventItem[]
        Note over P,D: after() → background refresh from Google + upsert
    else missing or expired
        D->>G: events.list (bounded concurrency, ≤4)
        G-->>D: items → upsert row
        D-->>P: items
    end
    Note over P: after() → warm M±1 cache rows post-response
    Note over P: create/update/delete → invalidateGcalCache() deletes touched rows
```

- **Schema** (`src/db/schema.ts`) — new `google_event_cache` table (migration `0011`):
  composite PK `(calendar_google_id, month)`, `events` jsonb (`GcalEventItem`s with dates as
  ISO strings), `fetched_at` timestamptz.
- **Cache layer** (`src/lib/google/eventsCache.ts`) — `getCachedMonthEventsForCalendars(ids,
  month)` is a **layered** cache: an in-process L1 map (keyed `googleCalendarId:month`) serves
  warm-instance repeat views with zero I/O; misses fall through to a **single batched** `SELECT`
  on `google_event_cache` for the whole month (~one round-trip regardless of calendar count,
  was N × ~50ms serialized reads); anything absent/expired blocks on a fresh `events.list` +
  upsert (`onConflictDoUpdate`, bounded concurrency ≤4, per-key in-flight dedup). Fresh rows
  serve directly (**60s**, `GCAL_CACHE_FRESH_MS`); stale rows serve while `after()` refreshes
  them in the background; hard expire **30min** (`GCAL_CACHE_EXPIRE_MS`). One entry serves every
  user/filter combo on both `/dashboard` and `/overview`. Google errors propagate — a failed
  refresh is never served as data.
- **Read path** (`src/lib/events/queries.ts`) — `fetchMonthEvents` calls the cache once for the
  whole selected calendar set, then flattens in calendar-name order (deterministic dedup
  preserved). After the response ships, `after()` warms the neighboring months only when the
  current month **missed** the cache (`PREFETCH_ADJACENT_MONTHS` gate), so fully-cached views
  don't churn extra background Google/DB work.
- **Invalidation** (`src/lib/google/eventsCache.ts`) — `invalidateGcalCache()` purges the L1 +
  in-flight entries **and** deletes the touched DB rows (affected calendars' Google ids
  collected during the write loops × every month in the old+new ranges via `monthsInRange`),
   so the mutating instance's own `router.refresh()` shows the change immediately. The L1 purge
   is per-instance (map lives only where the mutation ran) while the DB delete is shared, so
   other warm instances may serve the pre-change L1 copy for up to `GCAL_CACHE_FRESH_MS` (60s)
   before their background refresh corrects it. `findCopies` keeps reading
   the **uncached** integration during reconciles.
- **Helpers** — pure `cacheEntryState`, `encodeCachedEvents`, `decodeCachedEvents`
  (`src/lib/google/eventsCacheCodec.ts`), `monthsInRange`/`shiftMonth`
  (`src/lib/events/datetime.ts`), and `mapWithConcurrency` (`src/lib/async.ts`), each
  unit-tested. `cacheKeys.ts` (Next `cacheTag` helper) was removed.
- No Next cache config: `next.config.ts` and `(protected)/layout.tsx` were reverted to their
  pre-cache state.
- **Measured before/after** (authenticated `next dev`, Node 26, Neon pooler): warm dashboard
  `application-code` ~1.0–1.9s → **~0.35s**; overview 748ms → **~290ms**. Cold connection
  ~600ms + per-query ~50ms (serialized on `max: 1` postgres) remain the app's pre-existing
  floor; the events read itself is now one batched query on miss and zero I/O on L1 hit.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (280), and `pnpm build` pass;
  `pnpm db:generate` no drift. Manual: repeat month views are served from L1/DB with no Google
  calls; edits appear immediately after refresh; `next dev` runs on Node 26.
- **Full design reference:** [`docs/events-cache.md`](docs/events-cache.md) — the complete
  mechanism (architecture, data model, read/write flows, freshness, performance).

## 1.43 Calendar force refresh (Phase 3h)

The cache's freshness windows (60s fresh, then stale-while-revalidate to 30min) mean an
out-of-band Google edit can take ~60–90s to appear, with no way for the user to shorten it.
The dashboard header now carries a **force-refresh button** (an `ActionIcon` beside Today and
Filters) that re-fetches exactly the month the user is looking at and renders the new data
immediately.

```mermaid
sequenceDiagram
    participant U as User (dashboard)
    participant V as DashboardView (client)
    participant P as Page (RSC render)
    participant C as events cache (L1/L2)
    participant G as Google Calendar
    U->>V: tap force refresh
    V->>P: router.push(?refresh=<epoch-ms>) — one-shot nonce
    P->>C: getCachedMonthEventsForCalendars(ids, month, { force: true })
    C->>G: events.list per selected calendar (coalesced, ≤4 concurrent)
    G-->>C: items → upsert L2 (fetchedAt=now) + refill L1
    C-->>P: fresh items — same request
    P-->>V: render fresh events (skeleton shown while pending)
    V->>V: strip ?refresh= one-shot param
```

- **One-shot nonce** (`src/app/(protected)/dashboard/page.tsx`) — the button navigates with
  `refresh=<Date.now()>`. The server honors it only while it is a finite number younger than
  `REFRESH_NONCE_TTL_MS` (5min), so a stale history entry (back/forward) can't silently
  re-force a fetch.
- **Force in the same request** (`src/lib/google/eventsCache.ts`) —
  `getCachedMonthEventsForCalendars(..., { force: true })` bypasses L1 **and** L2 and blocks
  on fresh `events.list` calls for every requested calendar (`mapWithConcurrency`,
  coalesced, ≤4 in flight), then upserts the DB rows with `fetchedAt = now` (shared across
  instances) and refills L1 in the serving instance. The force deliberately runs **inside
  the same RSC render** rather than as an invalidation + `router.refresh()` round-trip: the
  follow-up render could be served by another instance whose warm L1 entry (≤60s old) would
  still shadow the fresh rows.
- **Scope** — selected calendars × displayed month only (what the user actually sees);
  hidden calendars and other months keep their normal freshness window. `force` returns
  `allServed: false`, so the `after()` adjacent-month prefetch fires like any miss. The
  button is `disabled` while Google is unconfigured (same guard as the New-event FAB), since
  the stub integration returns no events.
- **One-shot strip** (`DashboardView.tsx`) — a ref-guarded effect (mirroring the `?edit=`
  param pattern) removes `refresh` from the URL right after the forced render mounts, so
  later month/day navigation doesn't keep force-refreshing and burning Google quota. The
  button shows `loading` (oval `BUTTON_LOADER_PROPS`) via a dedicated `useTransition`
  wrapping the `router.push` directly (the same shape as the existing nav transitions);
  the page skeleton is `isPending || isRefreshing` so the load is always covered.
- No schema change and no new pure helpers (the `force` flag is pass-through glue:
  `page.tsx` → `fetchMonthEvents` → `eventsCache.ts`).
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.

## 1.44 Schedule week view + S. Month removal (Phase 3i)

The dashboard's resource schedule existed only as a single day ("Day" tab,
`ResourcesDayView`). A **Week** tab now sits between Month and Day, rendered with
`ResourcesWeekView` from `@mantine/schedule` and customized exactly like the Day tab
(same resource/group columns, icons, row height, event styling). At the same time the
legacy **"S. Month"** tab (`MobileMonthView`) and all of its contents were removed.

- **Tabs** (`DashboardView.tsx`) — order is now Month → **Week** (`IconCalendarWeek`)
  → Day. `ViewMode = "month" | "week" | "schedule"`; the `mobile` mode, its tab, its
  render branch, the `MobileMonthView` import, and the `MobileGridSkeleton` skeleton are
  gone. A stale `?view=mobile` URL silently falls back to the Month tab (the page's
  default branch).
- **Anchoring & navigation** — entering Week (like Day) always starts on **today's
  week** (`navigate({ view: "week", month: null, date: today })`). Prev/next step by
  **±7 days** (`shiftWeek`), the center label is the week range
  (`formatWeekLabel()` in `clientDateTime.ts`: `Aug 18 – 24, 2026`, month+year repeated
  only when the week crosses a month/year), and Today jumps to the current week. The
  MiniCalendar strip stays **Day-only** by decision — the Week view's built-in day-label
  row already shows all seven days.
- **Week start** — Monday, from the Mantine dates context default
  (`firstDayOfWeek: 1`) that the existing Month tab already uses; the app never overrides
  it, so all schedule views agree.
- **Cross-month data** — the displayed week can span two months, and Google month reads
  are month-keyed. `fetchRangeEvents({ months, … })` (new, in `queries.ts`) fetches each
  month through the existing layered cache, **dedupes items across months by
  `(calendar, google event id)`** (a multi-day event appears in both month listings),
  then applies the usual type/user filters, sort, and the single
  `dedupeEventsByGroupId` pass — preserving the deterministic representative-copy
  selection. The adjacent-month prefetch now warms the months outside the *range* (for a
  one-month range this is byte-for-byte the previous behavior). `fetchMonthEvents` is a
  thin wrapper over it, so Month/Day behavior is unchanged. A pure `weekDays()` helper
  (Monday-first, unit-tested) computes the seven days on both server and client.
- **Week view customization** (mirrors the Day tab): `rowHeight={56}`, 1.5rem vertical
  group (department) column (`--resources-week-view-group-label-width` var), 3rem
  resource column — set as a CSS variable on the root via `style` because the Week view's
  typed `vars` omits it (it cascades to the all-day sticky labels and time-indicator
  offset exactly like the Day view's typed var does) — `withHeader={false}`,
  `withCurrentTimeIndicator`, blank corner label, ellipsized resource labels,
  department rows as building icons, and initial vertical scroll of 07:00 via
  `scrollAreaProps.startScrollPosition` (the mount-only equivalent of the Day view's
  `startScrollTime`). No `renderEvent` override is needed: `ResourcesWeekView` already
  renders all-day bars with a built-in sticky label (the very thing the Day view's
  `renderEvent` hack exists for). Event taps open the same detail modal with the same
  origin rect; the empty "No users in the selected calendars" state is shared by Week
  and Day.
- **Skeleton** — new `WeekGridSkeleton` (weekday header row + resource rows over a
  7-column lane) for the Week tab; the day `ScheduleGridSkeleton` is untouched.

```mermaid
flowchart LR
    U["?view=week&date=YYYY-MM-DD"] --> W["weekDays(date) — Mon..Sun"]
    W --> MR["monthsInRange(weekStart, weekEnd) — 1 or 2 months"]
    MR --> FR["fetchRangeEvents(months)"]
    FR --> C1["month 1 → layered gcal cache"]
    FR --> C2["month 2 → layered gcal cache (boundary weeks)"]
    C1 --> D["dedupe (calendar, google id) across months"]
    C2 --> D
    D --> F["type/user filters + sort"]
    F --> G["dedupeEventsByGroupId"]
    G --> R["ResourcesWeekView (same resources/groups as Day)"]
```

- No schema change.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. new `weekDays`
  cases: mid-week, Sunday wrap, year boundary, month boundary, `monthsInRange` feed),
  and `pnpm build` pass.

## 1.45 Pinned Week-view day label (Phase 3j)

In `ResourcesWeekView` each day-label box spans a full day column (24 × 60px = 1440px)
with `justify-content: center`, so on a phone the label text ("Wed 19", …) is only
visible when the viewport happens to sit over the *middle* of that day — in practice the
Week view had no visible day indicator for most of the horizontal scroll range.
`@mantine/schedule` 9.5.1 (latest) offers no `renderDayLabel`-style hook, so the built-in
row is replaced with a pinned strip.

- **Pinned strip** (`WeekDayLabelStrip` in `DashboardView.tsx`) — a 2rem band rendered
  directly above the Week grid (outside the scroll area, so it stays put during both
  horizontal and vertical scrolling, like Mantine's otherwise sticky header). It shows a
  single chip pinned to the grid's left edge with the **leftmost visible day**
  (`ddd D`): today in primary-filled/bold (mirroring Mantine's `[data-today]` label
  style), weekends in red (`[data-weekend]`), body background and a bottom border matching
  the original row. A left spacer of the sticky corner's width
  (`3rem` + `1.5rem` when department groups are shown) carries a right border that
  continues the corner's divider line across the band.
- **Scroll tracking** — `onScrollPositionChange` on the Week view's ScrollArea derives
  `dayIndex = clamp(floor(scrollX / 1440), 0, 6)` (`WEEK_DAY_WIDTH_PX` assumes Mantine's
  default 60px slot width; we don't override `slotWidth`). State stores the index, not
  raw px, and bails out on unchanged values, so a scroll frame only re-renders when the
  visible day actually changes. `scrollAreaProps` is memoized (stable object identity) so
  the ScrollArea isn't handed a fresh props object every frame; it still carries the
  07:00 `startScrollPosition`.
- **Built-in row hidden** — `styles: { resourcesWeekViewDayLabelsRow: { display: "none" } }`
  on the Week view; the grid's sticky corner cell then spans only the time-label row and
  the strip supplies the 2rem band above it (net layout identical). The corner stays
  visible (hiding it would shift the time-label row off the slot columns), which is why
  the spacer's border exists.
- **Behavior** — week-to-week navigation keeps the ScrollArea mounted, so the chip
  follows the current scroll position into the new week; remounting (tab switch / week
  first load) starts at the week's first day (default horizontal scroll 0). The chip is
  non-interactive, like Mantine's original labels.
- No schema change, no new pure helper (the clamp/floor is a one-liner in the scroll
  handler).
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.

## 1.46 Out of Camp + location + location policy (Phase 3k)

Events can now take place **out of camp**. The event form gains an "Out of Camp"
checkbox (above the new **Location** textbox); checking it clears and disables the
location box. Each event type carries a new admin-set **location policy** — **In camp
only** / **Out of camp only** / **Both** — that restricts what the user may set: in-camp
and out-of-camp-only types both clear and disable the Location box (only "Both" lets the
user type a location, and only while out of camp is unchecked). The
location is stored in Google's first-class event `location` field (visible in Google
Calendar, prefilled on edit); the out-of-camp flag lives in the notes JSON
(`outOfCamp`, written only when `true`). A new `{location}` event-title token renders
the location in the calendar summary (it vanishes for in-camp-only, out-of-camp, and
out-of-camp-only events, whose location is always blank).

```mermaid
flowchart LR
    T["event_types.location_policy<br/>in · out · both (default both)"] --> C["clampOutOfCamp (pure)<br/>in → flag off, clear location<br/>out → flag on, clear location<br/>both → passthrough"]
    F["EventForm<br/>Out of Camp checkbox + Location box<br/>locked per policy, re-clamped on type switch"] --> A["createEvent / updateEvent<br/>resolveEventLocation (silent clamp)"]
    C --> F
    C --> A
    A --> G["Google event<br/>location field + notes.outOfCamp"]
    G --> R["parseEventOutOfCamp + item.location<br/>→ payload (detail modal, edit prefill)"]
    A --> S["formatEventTitle {location} token"]
```

- **Location policy** (new `src/lib/events/locationPolicy.ts`, pure, unit-tested in
  `locationPolicy.test.ts`) — `LOCATION_POLICIES = ["in", "out", "both"]`,
  `LocationPolicy`, `LOCATION_POLICY_LABELS`/`DESCRIPTIONS`,
  `isLocationPolicy`, `normalizeLocationPolicy` (unknown → `"both"`), and
  `clampOutOfCamp(policy, outOfCamp, location)` — the **single enforcement point**
  used by the form (locking the checkbox + clearing/disabling the location box),
  the type switch in the form, the edit prefill, and the server actions, so no
  out-of-policy combination can be submitted. `"in"` clears the location and forces
  the flag off; `"out"` clears the location and forces the flag on; `"both"` passes
  values through.
- **Schema** — migration `0012` adds `event_types.location_policy` (`text`, `NOT
  NULL` default `'both'`), following the `time_options` precedent (plain column,
  code-level normalization, no check constraint). `drizzle/meta/` journal + snapshot
  committed.
- **Event type settings** — `EventTypeFormValues` gains `locationPolicy`
  (validated); `listEventTypes`/`getEventTypesByNames` normalize + expose it (the
  server reads the policy through `getEventTypesByNames`); `createEventType`/
  `renameEventType` persist it, field-diff it in the audit log, and
  `EventTypeActionResult.field` gains `"locationPolicy"`. `EventTypeForm` gains a
  "Location policy" `Radio.Group` (three radios with descriptions; default `both`
  on create); `EventTypeTable` cards show the policy as a badge.
- **Notes block** (`src/lib/events/notes.ts`) — `EventNotes.outOfCamp?`;
  `parseEventOutOfCamp(description)` → `true` only for an explicit `true`
  (legacy/absent = in camp). The writer passes `outOfCamp || undefined`, so
  in-camp events store no flag at all.
- **Google layer** — `GcalEventInput.location?`, `GcalEventItem.location`;
  `buildEventBody` always sends `location` (an in-app update is a full replace, so an
  empty string actively clears a previously set one); `mapGoogleEvent` reads
  `event.location`. The events cache codec stores/decodes `location`, treating
  pre-release cache rows (no key) as `""` until their normal refresh.
- **Read path** (`src/lib/events/queries.ts`) — `CalendarEventPayload` gains
  `outOfCamp` (from `parseEventOutOfCamp`) and `location` (from
  `item.location`). `EventDetail` shows a "Location:" line and an "Out of Camp"
  badge. `dashboard/page.tsx` passes `locationPolicy` through the
  `EventTypeOption` shapes (`DashboardView`, `EventForm`).
- **Event form** (`EventForm.tsx`) — inside the `hasType` block, after the time
  fields and before Invitees: the "Out of Camp" `Checkbox` (description varies per
  policy) above the `Location` `TextInput`. `checked`/`disabled` are derived from
  `clampOutOfCamp(policy, values.outOfCamp, values.location)`, so a locked policy
  renders checked/unchecked + disabled with no extra state; checking (only possible
  when `both`) clears the location. `handleEventTypeChange` re-clamps both fields
  for the newly selected type (mirroring the time-option re-clamp). Edit prefill
  clamps the stored values against the type's *current* policy. The live calendar
  preview renders `{location}` from the effective (clamped) value.
- **Server enforcement** (`events/validate.ts`, `events/actions.ts`) —
  `EventFormValues` gains `outOfCamp: boolean` + `location: string` (pass-through,
  no new form errors); `EventTitleContext` gains `locationPolicy` (from
  `getEventTypesByNames`, `"both"` for untyped events); a new
  `resolveEventLocation(input, context)` — trim + `clampOutOfCamp` — runs after
  `resolveEventTime` in **both** `createEvent` and `updateEvent` (silent clamp,
  same philosophy as the time option). `buildGcalEventInput` writes
  `outOfCamp` to the notes, `location` to the Google input, and `location` into
  the `formatEventTitle` input. Audit `details` record `outOfCamp` + `location`.
- **`{location}` title token** (`src/lib/settings/formatEventTitle.ts`) —
  `EventTitleInput.location`; `case "location"` renders it (no styles, like
  `{description}`/`{departments}`); empty renders `""` with the existing
  trim/no-gap-collapsing semantics. `EVENT_TITLE_PLACEHOLDERS` gains
  `"{location}"` (Templates insert chip); `TemplatesForm`'s sample input +
  sample-data line include a location.
- **Scope note** — external (Google-only) events' locations show in the detail
  modal too (read straight from the Google field); the out-of-camp badge only
  appears for in-app events that flipped the flag.
- **Tests** — new `locationPolicy.test.ts` (clamp matrix); notes, cache codec,
  `formatEventTitle`, `eventTypes/validate`, and `events/validate` suites extended;
  three payload fixtures (`schedule`/`targets`/`counts` tests) gain the new fields.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (310), `pnpm build`,
  and `pnpm db:generate` (no drift — migration `0012` in sync) all pass. Live
  smoke against the configured Google Calendar still pending (verify location
  write/clear and the note round-trip with a disposable test event).

## 1.47 Staged event form wizard (Phase 3l)

The create/edit event modal is now a **one-step-at-a-time wizard** so the user is
never shown the full field stack at once. Steps, in order: **1 Event type →
2 Timestamp → 3 Location** (the Out of Camp checkbox + Location box stay together
in this step) **→ 4 Invitees → 5 On behalf of (admins only) → 6 Remarks** — the
old "Event Description" input, now labeled **Remarks** (internal field is still
`title`, so the `{description}` title token and notes round-trip are untouched).
Regular users get 5 steps (no On behalf of). Only the current step's fields
render, with **Back**/**Next** buttons (the existing submit button — "Create
event"/"Save changes" — appears on the last step).

```mermaid
flowchart LR
    S1[1 · Event type<br/>required to advance] --> S2[2 · Timestamp<br/>start/end + AM/PM validated]
    S2 --> S3[3 · Location<br/>Out of Camp + location, no required fields]
    S3 --> S4[4 · Invitees<br/>optional]
    S4 --> S5{admin?}
    S5 -- yes --> S6[5 · On behalf of<br/>creatorId required]
    S5 -- no --> S7
    S6 --> S7[6 · Remarks<br/>optional]
    P["Calendar preview<br/>always visible below the step content"] -.-> S1
    P -.-> S2 & S3 & S4 & S6 & S7
```

Locked-in decisions (user-confirmed):
- **One step at a time** with Back/Next navigation (not a reordered single
  scroll).
- **`Next` validates the current step before advancing** (`goNext` runs
  `form.validateField` over the fields owned by the step; the type step is
  gated on a selected type via an inline `eventType` field error).
- **No auto-advance** when an event type is picked — the user stays on step 1
  and taps `Next` themselves (tapping the selected badge again still
  deselects, staying on step 1).

- **Indicator** — Mantine 9.5.1 has no compact `Steps` component (only the full
  row-per-step `Stepper`, too tall for the 380px `size="sm"` mobile modal), so
  the indicator is a small custom row: one dot per step (completed + current in
  `brand-6`, upcoming in `gray-3`, current ringed and slightly larger;
  completed dots are clickable `UnstyledButton`s that jump **back only**) plus a
  `n of N · Label` line. Label per step from the step's `label` (`"Event type"`,
  `"Timestamp"`, `"Location"`, `"Invitees"`, `"On behalf of"`, `"Remarks"`).
- **Always-visible preview** — the "Calendar preview" `Paper` moved out of the
  per-step content to sit below it (above the nav row) on **every** step; the
  live `previewTitle` + `onTitleChange` (minimized-bubble label) wiring is
  unchanged.
- **Step model** (`EventForm.tsx`) — local `StepId`/`StepDef` types and a
  memoized `steps` array built from `isAdmin` (`{ id, label, fields }`, where
  `fields` are the `EventFormState` keys that must validate cleanly:
  `time → [start, end, startAmPm, endAmPm]`, `creator → [creatorId]`, the rest
  `[]`). `step` is a `useState` index; `goBack` decrements, `goNext` gates +
  increments.
- **Submit-error → step jump** — `STEP_BY_FIELD` maps the server-reported
  `EventResultField` to its owning step (`start`/`end`/`startAmPm`/`endAmPm`
  → Timestamp, `creatorId` → On behalf of, `title` → Remarks); on a failed
  submit the form `setStep`s there so the user lands on the offending field
  (the red notification is unchanged). `STEP_BY_FIELD` is `Partial` and the
  lookup is guarded, so admin-only steps simply don't resolve for regular
  users.
- **Implicit-submit guard** — the submit handler bails out unless the last step
  is active (the submit button only renders there; Enter in a textbox on an
  earlier step must not send a half-filled payload).
- **Unchanged** — `src/lib/events/validate.ts` and its tests (a selected type is
  enforced by the wizard gate, not a new form-level rule), `DashboardView`
  (modal shell, minimize bubble, `?edit=` deep link), server actions, and the
  `hasType`-era behavior is otherwise preserved: time-option re-clamp and
  out-of-camp re-clamp still run in `handleEventTypeChange`, the
  creator-is-an-invitee sync still runs in the On behalf of change handler, and
  the edit prefill still starts the user on step 1 with all fields filled.
- **Empty invitees** — when `inviteeData` has no options the Invitees step
  shows a dimmed "No people or departments to tag — the event lands in your
  own department calendar." line instead of a (previously hidden) `MultiSelect`.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (310) and
  `pnpm build` all pass. No schema change. Manual smoke pass in `pnpm dev`
  recommended (admin + regular, create + edit, per-step blocking, dot jump-back,
  preview visible throughout).

## 1.48 Pinned "On behalf of" select for admins (Phase 3l)

The admin **"On behalf of"** `Select` is no longer its own wizard step — it's
now **pinned at the top of the modal body** (directly under the step-dot
indicator) and stays visible on **every** step, so an admin can switch the
acting user at any point without navigating. As a side effect, **all roles now
walk the same 5 steps** (Event type → Timestamp → Location → Invitees →
Remarks); the 6th "On behalf of" step is gone.

- **Step model** — `StepId` drops `"creator"`; the step list is a module-level
  `const STEPS` (no longer a `useMemo` on `isAdmin`) with the five shared
  entries, and `form.validateField`'s per-step field lists no longer include
  `creatorId`. The dot indicator + "n of N" label simply render 5 for everyone.
- **Pinned select** (`EventForm.tsx`) — the `Select` is hoisted out of the
  per-step conditionals into `{isAdmin && ( <Box …><Select …/></Box> )}`,
  rendered right after the indicator `Stack`. The `Box` is
  `position: sticky; top: 0` (zIndex 1, `paddingBottom: 8`,
  `backgroundColor: var(--mantine-color-body)` — the same Paper token the modal
  content uses, matched against `@mantine/core`'s compiled CSS), so it literally
  sticks to the top while the body scrolls (tallest step = full-day Timestamp).
  The `Select` props + onChange (creators always sync into the invitee chips,
  matching the server's `withCreatorInvited`) are moved verbatim.
- **Validation** — the admin-only *required* creator rule is unchanged but now
  enforced purely at **submit** (via `validateEventForm(values,
  { requireCreator: isAdmin })`), not as a step gate: `STEP_BY_FIELD` drops the
  `creatorId` entry (there's no step to jump to), so a missing-creator error
  renders inline on the always-visible pinned `Select` (`form.errors.creatorId`)
  plus the existing red notification. Non-admin flow is untouched (they never
  rendered the select or a creator step).
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (310) and
  `pnpm build` all pass. No schema change. Manual smoke: admin create/edit —
  select visible on all 5 steps and sticky through the full-day Timestamp
  scroll; picking/deselecting a creator still syncs the invitee chips;
  non-admin sees 5 steps with no select.

## 1.49 Dashboard toolbar kebab overflow menu (Phase 3m)

On narrow phones the dashboard's date toolbar (date label beside
Today/Filter/Force-refresh) didn't fit the ~328px content width and wrapped
into two ragged left-aligned lines. The actions now live in a **three-dot
overflow menu** and the toolbar is a single, non-wrapping row.

- **Row layout** (`DashboardView.tsx`) — `‹` · centered date label · `›` ·
  `⋮`, all controls 43px (chevrons bumped from the default 28px),
  `wrap="nowrap"`. The label is the only flexible child
  (`flex: 1 / minWidth: 0 / textAlign: center` + `lineClamp={1}`) so it
  centers and ellipsizes instead of wrapping — month/day labels fit at a
  360px viewport; only the rare two-year-spanning week label truncates.
- **Kebab menu** — Mantine `Menu` (`position="bottom-end"`, `width={200}`,
  `shadow="md"`, `IconDotsVertical` target): **Today** (`IconCalendarCheck`,
  disabled when the view already shows today via a new `onToday` derivation —
  month === current month / date === today / week contains today),
  **Filters** (`IconFilter`, opens the unchanged `FilterModal`), divider,
  **Force refresh** (`IconRefresh`; disabled when Google is unconfigured, and
  its icon swaps to a `Loader` while refreshing). Plain items close the menu
  on click (Mantine default); outside-tap and `Escape` close it.
- **Animation** — `transitionProps={{ transition: "pop-top-right",
  duration: 150, timingFunction: "ease" }}` on the `Menu` (a premade Mantine
  Transition, verified against the installed `@mantine/core`): the dropdown
  fades/scales from its top-right corner — the button's corner — on open and
  close; Mantine handles the exit phase and honors reduced motion.
- **Active-filter badge** — the old standalone `FilterButton` badge moved onto
  the kebab itself (filled `Badge` at `top: -4 / right: -4`), so active
  filters stay visible while the menu is closed. `FilterButton` is unchanged
  and still used by `/overview`, `/parade-state`, `/settings/users`.
- **Imports** — added `Menu`/`Loader`/`Badge` and `IconDotsVertical`/
  `IconFilter`/`IconCalendarCheck`; dropped `Button`, `FilterButton`, and
  `BUTTON_LOADER_PROPS` from `DashboardView.tsx` (unused there — still used by
  `EventForm`/`EventDetail`).
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (294) and
  `pnpm build` all pass. No schema change. Manual check at ~360px width:
  toolbar stays one line across Month/Week/Day, menu animates in/out from the
  button corner, "Today" disabled when already on today, refresh disabled
  while Google is unconfigured, kebab badge tracks the active filter groups.

## 1.50 Icon-only circular FABs (Phase 3n)

The floating action buttons were wide text pills ("New event", "Add
user", "Export", …) and took too much horizontal space on phones. They
are now 43×43 **icon-only circles**: `FloatingActionButton`
(`src/components/FloatingToolbar.tsx`) sets `radius="50%"` + `w={43}` +
`h={43}` (the md shadow is unchanged), each call site passes the tabler
icon as children plus an `aria-label`.

- **Converted FABs** — `/dashboard` "New event" (`IconPlus`,
  still disabled while Google is unconfigured) and the minimized-form
  restore bubble (`IconChevronUp`; was chevron + truncated draft
  title), `/contacts` "Export" (`IconDownload`), `/settings/users`
  "Add user", `/settings/departments` "Add department",
  `/settings/event-types` "Add event type" — the three add-FABs had no
  icon before and use `IconPlus`, matching the create convention.
- **Discard pairing** — the "Discard draft" `ActionIcon` beside the
  restore bubble became a matching 43px circle (`radius="50%"`, `IconX`
  20px) so the pair reads as one unit.
- **Dead code removed** — the bubble no longer shows the draft title,
  so `DashboardView`'s `draftTitle` state (and its 3 resets) and
  `EventForm`'s `onTitleChange` prop + its `useEffect` are gone; the
  in-form live preview title rendering is untouched.
- The `AGENTS.md` FAB convention line was updated to match (circle,
  icon-only with `aria-label`, don't override width/height inline).
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (294)
  pass. No schema change.

## 1.51 Bigger FABs + download icon optical centering (Phase 3o)

The 43px FABs read too small once they were icon-only; they are now
1.2× the previous size. Sizes are centralized so every FAB matches by
construction.

- **Size constants** (`src/components/FloatingToolbar.tsx`) — new
  exports `FAB_SIZE = 52` (diameter, 1.2× 43) and `FAB_ICON_SIZE = 24`
  (1.2× 20). `FloatingActionButton` renders a 52px (`FAB_SIZE`) circle;
  all six FABs (`/dashboard` ×2, `/contacts`, `/settings/users`,
  `/settings/departments`, `/settings/event-types`) now pass their
  tabler icon at `FAB_ICON_SIZE`. The paired "Discard draft"
  `ActionIcon` beside the restore bubble also uses `FAB_SIZE` /
  `FAB_ICON_SIZE`, keeping the circle pair matched.
- **Download icon off-center fix** (`/contacts` FAB) — Tabler's
  `download` glyph is geometrically centered (bounding box off by
  ≤0.5px on the 24 grid) but optically the arrow (grid y 4–16,
  center y=10) sits above the grid center (y=12) while the tray is a
  thin baseline. The FAB icon carries a 2px downward nudge
  (`style={{ position: "relative", top: 2 }}` — relative, so flex
  centering is untouched; 2px matches the 24px render size). The
  modal's "Download" button icon is untouched (standard leftSection).
- Not touched: the global bottom nav, the dashboard toolbar
  (43px chevrons/kebab), `FilterButton`, modals and the form wizard.
- The `AGENTS.md` FAB convention line was updated (52×52 circle,
  `FAB_ICON_SIZE`/`FAB_SIZE` constants).
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (294)
  pass. No schema change.

## 1.52 Stale-while-navigating dashboard grid (Phase 3p)

The dashboard's perceived load was driven less by data latency than by the
skeleton flashing on **every** in-place navigation — with one warm dev
instance (L1 cache) and the Google stub, month/week/day fetches are fast,
so the skeleton→grid→skeleton churn was pure perception. The grid now
**keeps the current view visible during transitions** and swaps it in
place when the new server data commits, dimmed to 60% opacity (150ms
transition) while pending. The skeleton is reserved for cold loads (route
`loading.tsx`) and the force-refresh nonce window.

```mermaid
stateDiagram-v2
    [*] --> Grid: cold load (loading.tsx skeleton)
    Grid --> Dimmed: month/week/day/filter navigate (router.push)
    Dimmed --> Grid: new RSC data commits, in-place swap
    Grid --> Skeleton: force-refresh nonce (blocks on fresh Google)
    Skeleton --> Grid: fresh data commits
```

- **Skeleton condition** (`DashboardView.tsx`) — the grid skeleton renders
  only while `isRefreshing` (force-refresh), keyed off the committed `view`
  prop; no longer while `isPending`, which previously blanked the grid to a
  skeleton on every transition.
- **Dim during pending** — the grid wrapper `Box` carries
  `opacity: isPending ? 0.6 : 1` with a 150ms opacity transition (covers
  the week-day label strip; opacity doesn't affect layout, so the week
  day-width DOM measurement is untouched).
- **`targetView` removed** — its only read was the skeleton shape; since the
  skeleton now only appears during force-refresh (where the committed `view`
  prop equals the target), the state and its six `setTargetView` calls
  (shiftMonth/shiftDay/shiftWeek/switchView/goToday/handleApplyFilters) are
  gone.
- **Unchanged** — route `loading.tsx`, force-refresh UX (skeleton + button
  spinner for the whole blocking window), `router.refresh()` mutation
  swaps, and the week-view measurement gate (`isPending || isRefreshing`).
- The `AGENTS.md` skeleton convention now encodes the
  stale-while-navigating pattern (stale grid dimmed while pending, skeleton
  for cold loads + force refresh).
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (294) and
  `pnpm build` all pass. No schema change.

## 1.53 Dashboard grid cold-load reveal (Phase 3p)

The stale-while-navigating change reserved the grid skeleton for cold loads,
but the skeleton → grid swap was still a hard cut on first arrival. The grid
now **fades in from `opacity: 0.6`** on a fresh mount — a one-shot CSS
animation (no JS, so no hydration flash) that softens the arrival without
adding latency: the grid is fully readable and interactive even while
dimmed.

- **CSS** (new `src/app/globals.css`, the app's first project stylesheet,
  imported in `src/app/layout.tsx` after the Mantine styles) —
  `@keyframes dashboard-grid-reveal { from { opacity: 0.6 } }` (no `to`: it
  animates to the computed value and hands back to the inline
  opacity/transition) applied by `.dashboard-grid-reveal` inside
  `@media (prefers-reduced-motion: no-preference)`.
- **Scope** — `DashboardView.tsx` adds the class to the persistent grid
  `Box` (the same one carrying the `isPending` dim). Because the animation
  lives on the stable wrapper, it plays only when the route remounts — cold
  load, tab-away-and-back, deep link — and never on in-place month/week/day
  navigation or view-tab switches (same element, children swap) or
  force-refresh (the skeleton renders inside the same Box).
- The `AGENTS.md` skeleton convention bullet now encodes the reveal.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (294) and
  `pnpm build` all pass. No schema change.

## 1.54 Day-view date picker: MobileMonthView replaces mini calendar (Phase 3q)

The Day (schedule) view navigated days with a 7-day `MiniCalendar` strip pinned below the
header (prev/next arrows deliberately hidden) — useful for ±3 days, but there was no way
to jump to an arbitrary day. The strip is removed and replaced by a **"Select date"** item
in the header's ⋮ overflow menu (Day view only) that opens a floating month picker.

```mermaid
sequenceDiagram
    participant U as User
    participant M as ⋮ Menu
    participant P as DateSelectorModal (MobileMonthView)
    participant D as Dashboard (URL)
    U->>M: tap ⋮ → Select date
    M->>P: open (pickerDate = current ?date= month)
    U->>P: ‹ / › chevron or tap a day
    alt month chevron
        P->>P: pickerDate ±1 month (local state)
    else day tap
        P->>D: onPick(day) → ?date= + ?month=
        P->>M: close
    end
```

- **`DateSelectorModal`** (new `src/app/(protected)/dashboard/DateSelectorModal.tsx`) —
  a centered `size="sm"` floating `Modal` titled "Select date" wrapping
  `@mantine/schedule`'s `MobileMonthView` (the dashboard's existing package; its styles
  are already imported in the root layout). `selectedDate` highlights the current `?date=`,
  today is highlighted by the component's default, and the bottom events list is hidden
  (`styles.mobileMonthViewEventsList: display: none`) — a pure date navigator, no events.
- **Custom `renderHeader`** — required because standalone `MobileMonthView` (v9.5.x) never
  invokes `onDateChange`, and its default header's year button only fires `onYearClick`
  (useful only with a `Schedule` year view, which the app doesn't use). The header renders
  ‹ `MMMM YYYY` ›; month navigation drives the modal's local `pickerDate` state (re-seeded
  from `date` on each open), day taps navigate immediately.
- **Navigate + close** — `onDayClick` calls the parent's `pickDate(day)` →
  `navigate({ date, month: day.slice(0, 7) })` (the same param pair as `shiftDay`), then
  closes the picker. The in-place stale-while-navigating grid transition handles the swap.
- **`DashboardView.tsx`** — `MiniCalendar` import + strip block removed; new `pickerOpened`
  disclosure, a `Menu.Item` (`IconCalendarDot`, rendered only when `isSchedule`) between
  **Today** and **Filters**, and the modal mounted beside the other modals.
- Not touched: the header day chevrons (±1 day), Today, Filters, Force refresh, and the
  Month/Week views (no new menu item there). No schema change.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (294) and `pnpm build` all
  pass. Pending manual dev check: ‹ › month stepping, today/current-day highlights,
  day-tap navigation + close, item absent in Month/Week.

## 1.55 Parade State filter row scoping + Event Types removal (Phase 3r)

The Parade State page's filters (⋮ → Filters) appeared to do nothing: the
`?cal`/`?users`/`?types` params only narrowed the server-side
`fetchMonthEvents()` call, while the department/user card list rendered from an
unscoped user list — every user card stayed visible ("No events" when nothing
matched). On top of that, regular users defaulted to fetching only their own
department's calendar, so other users' cards were almost permanently "No
events". The Event Types filter was also removed from the page on request.

```mermaid
flowchart LR
    subgraph before [Before]
      B1[Filter params] --> B2["fetchMonthEvents (events only)"]
      B3[All active users] --> B4["Cards: always every user"]
    end
    subgraph after [After]
      A1[Filter params] --> A2["scopeParadeUsers()"]
      A2 --> A3["users prop = scoped rows"]
      A1 --> A4["fetchMonthEvents (cal/user scope)"]
      A3 --> A5["Cards follow the filters"]
    end
```

- **All-calendars default for every role** — `page.tsx` no longer role-scopes
  the default (the `getUserDepartmentId` lookup is gone): `selectedCalendars`
  defaults to all calendars for everyone, so the page opens on every
  department for all roles (matching the original requirement "all users
  across all calendars"), and "all chips selected" in the dialog means "no
  filter" with no badge. The default month fetch now spans all calendars, so
  other users' cards show their real out-of-camp events.
- **Row scoping** — new pure helper `scopeParadeUsers()` in
  `src/app/(protected)/parade-state/scopeUsers.ts` (unit-tested in
  `scopeUsers.test.ts`): a calendar selection that is empty or covers every
  calendar is "no narrowing" (everyone incl. the unassigned group); a proper
  subset keeps only users in the selected departments (unassigned hidden); an
  empty user selection is "no filter", otherwise membership. The view's
  `users` prop is now
  `scopeParadeUsers(activeUsers, …, selectedCalendars, selectedUsers)` (was: all
  active users), so the Calendars and Users filters narrow the visible rows;
  the dialog's Users options are the calendar-scoped set (no user narrowing, so
  the Users filter stays editable) plus the current user via
  `filterUserOptionIds`.
- **Event Types filter removed** — `page.tsx` no longer reads `?types=`
  (`typeFilter: []`) and no longer calls `listEventTypes()` on this route; the
  view drops the group, its local state and its badge term.
  `handleApplyFilters` writes only `cal`/`users` (plus `types: null`, which
  also scrubs the param from older URLs), and a one-shot ref-guarded effect
  (the dashboard `?edit=` strip pattern) removes `?types=` from deep links on
  mount.
 - Not touched: dashboard and Event Types settings (the dashboard keeps its own
   Event Types filter), event create/edit, the events cache. No schema change.
 - Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (301) and
   `pnpm build` all pass.

## 1.56 No-keyboard dropdowns (Phase 3s)

Searchable Mantine `Select`/`MultiSelect` targets are editable `<input>`s, so on
a phone the virtual keyboard popped up every time a user tapped a dropdown —
even when they only wanted to pick from the list.

- **New shared wrappers** `NoKeyboardSelect` / `NoKeyboardMultiSelect` in
  `src/components/NoKeyboardSelect.tsx`. They keep a native `readOnly`
  attribute on the target input — set through Mantine v9's styles-API
  `attributes.input`, which lands on the DOM input without triggering
  Mantine's `readOnly` prop (that one disables the whole dropdown, so it was
  not an option) — while the dropdown is closed, and lift it when the dropdown
  opens (tracked via `onDropdownOpen`/`onDropdownClose`, chaining the
  consumer's handlers). Result: a tap opens the list without the keyboard;
  the user can tap the field once the list is open and type to filter.
- **Applied to every searchable dropdown** — `FilterModal`'s search-variant
  groups (dashboard + Parade State Users filters), the Event form's
  "On behalf of" select and "Invitees" multi-select, and the User form's
  Department select. `CalendarSelect` (currently unused) was rebased on
  `NoKeyboardMultiSelect` so it stays consistent if adopted later.
  Non-searchable selects (role, access level) and `Menu`-based dropdowns were
  already button targets and needed no change.
- **Trade-off** — desktop-only, typing into a *closed* focused select no
  longer opens+filters it; the list opens via click or Arrow-down first, then
  typing works. Mantine's own keyboard handling is untouched (it gates on the
  `readOnly` *prop*, which is never set).
- New convention recorded in `AGENTS.md`: searchable dropdowns must use the
  `NoKeyboard*` wrappers, never a raw `searchable` Select/MultiSelect and
  never Mantine's `readOnly` prop.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (301) and
  `pnpm build` all pass. Manual on-device check (tap → list without
  keyboard; tap field → keyboard + filter) is still owed.

## 1.57 Audit log viewer + retention + export (Phase 3t)

The audit write-side (table `audit_logs` + `logAction` in every server action) shipped in
Phase 2d. This phase adds the **read side**: a Settings tab to browse the log with filters,
configurable retention with on-read rotation, and CSV export.

```mermaid
flowchart LR
    A[Server action / login] -->|logAction| B[audit_logs table]
    B --> C[Audit Log tab /settings/audit-log]
    C --> D[URL-param filters<br/>actor / action / entity / dates / search]
    D --> E[Keyset-paginated card list<br/>load more via server action]
    C --> F[CSV export /api/audit/export]
    B --> G[Rotation: purge on read]
    G --> H[settings.audit_log_retention_days<br/>General tab, default 90]
```

- **Schema (migration `0013`)** — `settings.audit_log_retention_days` integer, default `90`,
  bounded 7–365 by the General tab. `src/lib/settings/validate.ts` adds
  `normalizeRetentionDays`/`validateRetentionForm` (clamps + rounds; non-finite → default).
- **General tab** — second card with a `NumberInput` + Save wired to a new
  `updateAuditLogRetention` server action (`requireAdmin`, field diff audit-logged as
  `settings.update`). `getSettings()` now returns the value.
- **Read module** `src/lib/audit/queries.ts` — pure, unit-tested helpers
  (`parseAuditFilters` with real-calendar-date validation, `encode/decodeAuditCursor`
  base64url `[createdAtMs, id]`, `dayBounds`) plus DB functions:
  `listAuditLogs` (keyset page ordered `created_at DESC, id DESC`, `and(...)` conditions for
  actor-name / action / entity-type / free-text `ilike` / from-to bounds, `pageSize` + cursor),
  `purgeExpiredAuditLogs(retentionDays)` (indexed delete on `created_at`, returns count),
  `listAuditActors`/`listAuditEntityTypes` (distinct, sorted). `listAuditActions` moved to
  `src/lib/audit/build.ts` so the client filter UI can import it without dragging in `db`.
- **Server actions** `src/lib/audit/actions.ts` — `loadMoreAuditLogs(filters, pageSize)`
  (admin-guarded, capped 50) and `purgeAuditLogs(days)` (admin-guarded, clamps days, logs an
  `audit.purge` entry with the deleted count — a new `AUDIT_ACTIONS` value).
- **Rotation** — on every render of the Audit Log page, `listAuditLogs` first purges rows
  older than the configured retention, so storage stays bounded without a cron job; the
  General tab controls the window and the Audit Log tab offers a manual "Delete older than N
  days" button (confirm modal → `purgeAuditLogs` → notification with count).
- **Audit Log tab** `/settings/audit-log` (admin-only, added to `SettingsTabs`) —
  server `page.tsx` parses `searchParams`, fetches filter options + page 1, passes to the
  client `AuditLogView`. Filter card uses `NoKeyboardSelect` for actor/action/entity, two
  `DatePickerInput`s (from/to), and a search box; each change navigates URL params
  (clearing the cursor) with the list dimmed during the RSC transition. Cards render the
  humanized action label (`actionLabel`), actor + role, entity name, route/method badges, and
  an Asia/Singapore timestamp; "Details" opens a modal rendering `diffFields` as
  before → after lines or pretty JSON (`formatAuditDetails`). "Load more" appends via the
  server action. Export FAB (floating, `SETTINGS_TAB_BAR_OFFSET`) opens a confirm modal that
  downloads the filtered CSV.
- **CSV export** `src/app/api/audit/export/route.ts` — admin-guarded GET, same filters as the
  page, streams up to 10k rows as `text/csv` with `Content-Disposition: attachment`
  (`audit-log-YYYY-MM-DD.csv`). Pure `src/lib/audit/export.ts` (`csvField` quoting/escaping,
  `buildAuditLogCsv` with `details` as stringified JSON) is unit-tested.
- **Login events wired** — `src/lib/auth.ts` now logs `auth.login.success` for admin and user
  logins (via `actorFromUser`, so the admin pseudo-account gets a null actor id) and
  `auth.login.failure` recording only the derived phone / reason — never the raw input, which
  could be the admin password.
- New unit tests: `src/lib/audit/queries.test.ts`, `export.test.ts`, `format.test.ts`, plus
  retention cases in `src/lib/settings/validate.test.ts`.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (335), `pnpm build` (routes show
  `/settings/audit-log` + `/api/audit/export`), `pnpm db:generate` no drift. Migration `0013`
  applies automatically on the next `main` push (CI migrate job).

## 1.58 Dashboard loading: skeleton only, fade-in on swap (Phase 3u)

The dashboard carried two opacity-based loading appearances on top of the
skeleton: in-place navigation dimmed the stale grid to 60% while pending,
and the grid faded in *from* 60% opacity on a fresh mount. Both are removed
— the Mantine skeleton is now the **only** loading indicator on the page
(no dimming/darkening ever), and the still-jarring skeleton → grid cut is
softened by a fast fade-in of the **new** grid.

```mermaid
stateDiagram-v2
    [*] --> RouteSkeleton: cold load (loading.tsx)
    RouteSkeleton --> Grid: data renders, fade-in
    Grid --> GridSkeleton: month/week/day/view/filter nav (transition push)
    GridSkeleton --> Grid: new RSC commits, in-place swap + fade-in
    Grid --> GridSkeleton: force-refresh nonce (blocks on fresh Google)
    GridSkeleton --> Grid: fresh data commits, fade-in
    Grid --> Grid: edit/refresh URL strips (plain push, no visual change)
```

- **Skeleton on every pending data navigation** (`DashboardView.tsx`) — the
  grid branch renders the view-matched skeleton
  (`MonthGridSkeleton`/`WeekGridSkeleton`/`ScheduleGridSkeleton`) while
  `gridLoading = useMinSkeletonHold(isPending || isRefreshing)`; the stale-grid
  dim (`opacity: isPending ? 0.6 : 1`, 150ms transition) is gone. During
  pending the skeleton is keyed off the still-committed `view`/`month` props,
  so e.g. a month → week switch briefly shows the month skeleton before the
  week grid commits.
- **Minimum ~350ms hold** — `useMinSkeletonHold` (`src/lib/loading/minHoldLoading.ts`)
  keeps the skeleton up until 350ms after the load *started*, so warm cached
  loads (sub-100ms round-trips in dev) read as a deliberate skeleton → reveal
  sequence instead of a flash. A new pending supersedes any outstanding hold,
  so holds never stack.
- **Fade-in on reveal, no remount, scroll preserved** — shared
  `CONTENT_ENTER_CLASS` (`src/lib/loading/contentEnter.ts`, declared in
  `src/app/globals.css` as `.content-enter`, 300ms ease-out inside
  `@media (prefers-reduced-motion: no-preference)`; content fades 0 → 1 — it
  is never visible dimmed, unlike the old 0.6 reveal). The class ships in the
  SSR HTML, so the cold load (route `loading.tsx` → grid) plays it on first
  paint with no hydration flash. The grid `Box` must stay mounted across
  commits (the week/schedule `ScrollArea` keeps its scroll position on
  week-to-week / day-to-day navigation), so `useContentEnter(weekBoxRef,
  !gridLoading)` restarts the animation on the skeleton → content flip via a
  classList remove/reflow/re-add in a `useLayoutEffect` — before paint, so the
  reveal frame already shows the fade at frame 0.
- **URL strips stay invisible** — the one-shot `edit`/`refresh` param strips
  navigate with a plain `router.push` (no `startTransition`), so they never
  set the pending flag: no skeleton, no fade replay (otherwise force refresh
  would fade twice — once for the new data, again when the nonce strips).
- **No-op guard in `navigate()`** — skips the push when the built href equals
  the current URL (e.g. tapping "Today" while already there), so no-op
  changes never flash the skeleton.
- Unchanged: route `loading.tsx` cold-load skeleton, force-refresh UX
  (skeleton + button spinner for the whole blocking window), the `router.refresh()`
  mutation swap, and the week-view slot-width measurement gate (now `gridLoading`).
- Superseded in detail by [1.59](#159-standard-loading-appearance-across-the-app-phase-3u), which
  generalizes the mechanism (`useMinSkeletonHold`/`useContentEnter`) and
  applies it to every loading surface.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (338) and
  `pnpm build` all pass. No schema change.

## 1.59 Standard loading appearance across the app (Phase 3u)

The 1.58 dashboard mechanism was generalized into two shared pieces and
applied to **every** loading surface, so the whole app now has one loading
language: **skeleton only, ~350ms minimum hold, 300ms fade-in on reveal** —
no dimming/darkening anywhere.

```mermaid
flowchart LR
    S["Skeleton<br/>(min ~350ms hold)"] -->|reveal| F["Content fades in<br/>(.content-enter, 300ms)"]
    subgraph "shared"
      M["useMinSkeletonHold(pending)"]
      C["useContentEnter(ref, shown)"]
      K[".content-enter keyframes<br/>(globals.css, reduced-motion guarded)"]
    end
    M --> S
    C --> F
    K --> F
```

- **`useMinSkeletonHold(pending)`** (new `src/lib/loading/minHoldLoading.ts`)
  — `MIN_SKELETON_HOLD_MS = 350`; true while `pending`, plus until 350ms after
  the load started. Implemented as a single state update on the end edge
  (bail-out on equal values — the React 19 `react-hooks/set-state-in-effect`
  rule forbids the naive per-branch reset) and a timeout that releases the
  hold; timers are cleared on re-entry, so consecutive fast navigations never
  stack holds.
- **`useContentEnter(ref, shown)` + `CONTENT_ENTER_CLASS`** (new
  `src/lib/loading/contentEnter.ts`) — the reveal fade restarts on the
  skeleton → content flip (ref-init skips the SSR cold mount, which plays the
  class from the HTML). `globals.css` now holds only the generic
  `.content-enter` keyframes (the dashboard-specific `dashboard-grid-enter`
  from 1.58 is gone).
- **Dashboard** — `gridLoading`/`useContentEnter` replace the 1.58
  identity-keyed retrigger (simpler: key off the actual reveal, not the URL
  identity); the week slot-width measurement gate uses `gridLoading`.
- **Audit log** (`AuditLogView.tsx`) — the last dimming pattern left
  (`opacity: isPending ? 0.6` on the row list) is replaced by a 5-card
  skeleton (`AuditLogRowSkeleton`, also reused by `audit-log/loading.tsx` so
  the shapes stay in sync) while `useMinSkeletonHold(isPending)`; the list
  `Stack` carries `CONTENT_ENTER_CLASS` + `useContentEnter`; `navigate()`
  gains the no-op-href guard.
- **Parade state** (`ParadeStateView.tsx`) — previously showed *nothing*
  while in-place navigating (and cross-month day switches briefly rendered
  the stale month's events — usually an empty list — until commit). Now:
  `contentLoading = useMinSkeletonHold(initialMonth !== month)` shows a
  department/user-card skeleton (shared `ParadeStateDepartmentSkeleton`, also
  reused by `parade-state/loading.tsx`) for cross-month switches only —
  in-month day switches and filter applies stay instant because their content
  is derived optimistically from local state (a skeleton there would hurt the
  snappy feel). The content `Box` carries `CONTENT_ENTER_CLASS` +
  `useContentEnter`.
- **Fade-in on all committed cold loads** — `CONTENT_ENTER_CLASS` added to
  the content root of the other surfaces: `ContactList`, `UserTable`,
  `DepartmentTable`, `EventTypeTable`, `SettingsForm` (General tab),
  `TemplatesForm`. No JS retrigger needed there: segment navigation remounts
  them (the class plays), and `router.refresh()` mutations don't remount
  (no replay).
- **Out of scope (by design)** — `router.refresh()` mutation swaps (button
  loader covers them), URL-param strips (plain pushes), and modals (no
  loading of their own).
- The `AGENTS.md` bullet "Standard loading appearance: skeleton only +
  fade-in on reveal" is now the canonical checklist to apply whenever a
  loading skeleton is implemented or updated.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (338) and
  `pnpm build` all pass. No schema change.

## 1.60 Event form: no accidental submit on reaching the Remarks step (Phase 3v)

The create/edit wizard **submitted the moment the Remarks step appeared** — the
event was saved before the user could type anything. The trigger was not Enter:
the **Next button and the Create/Save button are the same DOM `<button>` node**.
They are the two branches of one conditional rendering the same `<Button>` at the
same position, so React reuses the element and only swaps props. On the last
step, clicking "Next" → `goNext()` → `setStep(4)`, and React 18/19 flushes
discrete-event (click) state updates **synchronously** — so the button's `type`
attribute flips `"button"` → `"submit"` before the click event finishes. The
browser then runs the click's default action against a now-submit button,
firing the form's `submit` event; Mantine's `form.onSubmit` validates and calls
`createEvent`/`updateEvent`. Desktop and mobile alike (Chrome verified), and the
event really was saved.

```mermaid
flowchart TB
    N["Click 'Next' on the Invitees step<br/>type='button'"] --> R["goNext → setStep(4)<br/>React flushes synchronously"]
    R --> T["Same DOM node re-typed to type='submit'"]
    T -->|"before: browser runs the click default action"| S["form submit → createEvent / updateEvent<br/>modal closes before typing"]
    T -->|"after: click.preventDefault + distinct keys"| X["[blocked]<br/>advances to Remarks only"]
```

Changes in `src/app/(protected)/dashboard/EventForm.tsx`:
- **Cancel the step-advance click** — the Next `Button`'s `onClick` now calls
  `event.preventDefault()` before `goNext()`. A canceled click never runs the
  button's activation behavior, so the form cannot submit regardless of the
  `type` flip mid-handler.
- **Distinct button keys** — the Next button gets `key="next"` and the
  Create/Save button `key="submit"`, so React mounts a **fresh** DOM node per
  branch instead of re-typing the clicked one (belt-and-suspenders against the
  same hazard; a "Back then Next" round-trip just remounts, which is harmless).
- **Form-level Enter guard** — `<form onKeyDown={handleFormKeyDown}>`
  `preventDefault()`s `Enter` when the target is an `INPUT`/`SELECT`, so no
  single-line field (Location, the admin "On behalf of" select, the invitee
  input) can trigger implicit submission on any step. `TEXTAREA` is excluded —
  textareas have no implicit submit, and the guard would eat the newline. The
  bubbling handler runs **after** component key handlers (e.g. the datetime
  pickers' Enter-to-confirm), so only the native default — the submit — is
  cancelled. The existing `if (!isLastStep) return` guard stays as a safety net.
- **Remarks → multiline `Textarea`** — swapped the Remarks `TextInput` for a
  `Textarea` (`autosize`, `minRows={2}`, `maxRows={4}`, `resize: none`) so Enter
  inserts a newline and long notes wrap. It binds to the same `title` field, so
  the `{description}` title token and the `rawTitle` notes round-trip are
  untouched.
- **Not changed** — the wizard steps/navigation, the submit button (now the only
  real submit path), `validate.ts`, the server actions, and the notes/title
  round-trip.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (348) and
  `pnpm build` all pass. No schema change. Manual smoke owed: create + edit →
  walk all 5 steps; reaching Remarks must not submit; the event saves only on
  the Create/Save tap. Type multiline text, Enter inserts a newline (no submit).
## 1.61 Email change syncs Google Calendar access (bugfix)

Editing a user's email (or department) previously left Google Calendar ACLs stale:
the new email only got `reader` access the next time an admin opened the department's
Shares modal (reconcile-on-read), and the **old** email kept access forever unless an
admin manually revoked it. Now the user create/update server actions reconcile the
affected department calendars immediately.

```mermaid
flowchart LR
    A["updateUser / createUser"] --> B{email or department changed?}
    B -- no --> C["return ok"]
    B -- yes --> D["reconcileUserAccessChange"]
    D --> E["per affected calendar<br/>grant reader to missing assigned emails"]
    D --> F["revoke given-up email<br/>when no assigned user holds it"]
    E --> G["return ok + warnings (if any failed)"]
    F --> G
```

- **`src/lib/roster/shares.ts`** — new `reconcileUserAccessChange()` (async, Google/DB
  I/O): for each department calendar touched by the change it (a) grants `reader` to
  every assigned user's email missing an ACL rule — covering the new email and the
  user's unchanged email after a department move — and (b) revokes the ACL rule for the
  email the user gave up in the department they left, but only when no assigned user
  holds that email anymore and never for an inherent owner (calendar resource id,
  service account, admin account). Google unconfigured short-circuits to no warnings.
  Per-calendar failures are collected into human-readable warnings instead of failing
  the whole action (the roster DB update already committed). Two new pure, unit-tested
  helpers: `diffRevocable(candidates, assigned)` (the mirror of `diffAccess`) and
  `isInherentOwnerEmail(...)` — the latter now shared with `listDepartmentAccess`, whose
  inline owner check was refactored to use it.
- **`src/lib/roster/actions.ts`** — `updateUser` calls `reconcileUserAccessChange` after
  the DB write + audit log when `email` or `departmentId` changed; `createUser` does the
  same so a newly created user with an email+department gets `reader` immediately.
  `RosterActionResult`'s success variant gains optional `warnings?: string[]`.
- **`src/app/(protected)/settings/users/UserForm.tsx`** — a success with warnings shows a
  yellow "User updated/created" toast with the warning text instead of the green one, so
  partial Google-sync failures are visible without blocking the save.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (355), and `pnpm build` pass.
  No schema change — `db:generate` shows no drift.

## 1.62 Department selects without type-to-filter search

All department-selecting dropdowns should be plain lists — no type-to-filter. Department
lists are short and always visible, so `searchable` (and with it the editable input target
and the `NoKeyboard*` deferred-readOnly dance) adds nothing.

- **`src/app/(protected)/settings/users/UserForm.tsx`** — the Department select dropped
  `searchable` and the `NoKeyboardSelect` wrapper, now a plain `Select` (like the Role
  select). Non-searchable Mantine combobox targets are buttons, so tapping them on mobile
  never raises the virtual keyboard.
- **`src/components/CalendarSelect.tsx`** (currently unused, documented in README) —
  rebased from `NoKeyboardMultiSelect` to a plain non-searchable `MultiSelect` for the
  same reason, so it stays consistent if adopted later.
- **Unchanged** — the mixed users+departments "Invitees" multi-select in the Event form
  keeps `searchable`: with a large roster, typing is the only fast way to find someone
  (deliberate, per the user); the chip-grid "Calendars"/"Department" filter groups in the
  filter dialogs already have no search; all user-only dropdowns (On behalf of, Users
  filter groups, Audit Log Actor) keep search.
- Convention recorded in `AGENTS.md`: department-specific selects are never searchable —
  use plain (non-searchable) `Select`/`MultiSelect`, whose button targets can't raise
  the keyboard at all.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass. No schema change.

## 1.63 Dashboard Agenda view (Phase 3w)

The dashboard gains a fourth view — **Agenda** (`?view=agenda`) — a day-anchored
vertical list of the selected day's events grouped by date, rendered with Mantine's
`AgendaView` (already installed for the day-tap modal). It reuses the shared day
navigator (‹ day ›) and the header ⋮ menu exactly like the Day view: **Today**,
**Select date** (month-calendar picker), **Filters**, and **Force refresh** — the
"Select date" item is now offered in every day-anchored view.

```mermaid
flowchart LR
    A["?view= param"] --> B{"anchor unit"}
    B -- "month (default)" --> C["?month=YYYY-MM"]
    B -- "week / schedule / agenda" --> D["?date=YYYY-MM-DD"]
    C --> E["fetchMonthEvents(month)"]
    D --> F["month derives from date<br/>week: 2-month range fetch"]
    E --> G{"view"}
    F --> G
    G -- month --> H["MonthView"]
    G -- week --> I["ResourcesWeekView"]
    G -- schedule --> J["ResourcesDayView"]
    G -- agenda --> K["AgendaView<br/>single-day range"]
```

- **`page.tsx`** — the view parse accepts `agenda`; everything downstream already
  handles day-anchored views (the page derives `?month=` from `?date=`), so there is
  no fetch or cache change.
- **`DashboardView.tsx`** — `ViewMode` gains `"agenda"`. A new `isAnchoredView` flag
  (`schedule` ∪ `agenda`) centralizes the day-level behavior: the ‹/› chevrons step
  days (`shiftDay`, which already syncs `?month=` across a month edge), the label
  shows the day, "Today"/`onToday` compare `date`, and `switchView` starts anchored
  views on today and restores the viewed month when leaving one. The ⋮ menu's
  "Select date" item (reusing `DateSelectorModal`) now shows for any day-anchored
  view. The grid area gains an `AgendaView` branch: single-day range
  (`rangeStart` = `rangeEnd` = `date`), the redundant range header hidden via
  `styles`, the shared boxed look supplied through `style` (the component root is an
  unstyled Box in v9.5.1), stock event rows (color stripe + title + time / "All
  day"), event tap → `EventDetail` via the shared origin-rect pattern, and the new
  `AgendaListSkeleton` in the `gridLoading` chain. The week/schedule "No users" empty
  state no longer guards the `view` checks — month and agenda settle the branches
  first, so the agenda renders whatever events the month fetch returned (it lists
  events with no invitees too).
- **`calendarSkeleton.tsx`** — new exported `AgendaListSkeleton` (bordered radius-md
  box: one date-header stub plus deterministic event-row stubs — color-stripe sliver
  + title/time bars) so the in-place swap and the shared grid pattern stay in sync.
- **`loading.tsx`** — the route-level tab-strip skeleton is now 4 columns.
- **Decisions** — the Month-view day-tap agenda modal is kept as-is (instant peek
  with swipe + scale animation); the Agenda tab is a separate full-screen mode.
  Rows use the stock Mantine rendering — `EventDetail` remains one tap away, and the
  other views also show title only.
- **Not touched** — data flow/events cache (same per-month cached fetch as the Day
  view), filters, force-refresh nonce, `DateSelectorModal`, `EventDetail`/`EventForm`.
  No schema change.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (355), and `pnpm build`
  all pass.

## 1.64 Agenda day slide-in + create-event button (Phase 3x)

The Month-view day-agenda modal (tap a day → that day's agenda in the floating dialog) had
two gaps: changing the day (swipe left/right or the ‹ › chevrons) was a hard content swap
with no motion, and — with the page-level "New event" FAB hidden behind the modal overlay —
there was no way to create an event **for the day being viewed** without closing the modal
first.

```mermaid
flowchart LR
    A[Day agenda modal] -- "swipe left/right" --> B{"release ≥ 48px?"}
    A -- "‹ › chevron" --> C["shiftAgendaDay ±1"]
    B -- yes --> C
    B -- no --> D[no day change]
    C -- "agendaSlideDir ±1<br/>+ setAgendaDate" --> E{crosses loaded<br/>month edge?}
    E -- no --> F["wrapper remounts (key = day)<br/>220ms directional slide-in"]
    E -- yes --> G["navigate ?month= ±1"]
    G --> H["new month events commit<br/>(modal stays open)"]
    H --> F
    I["New event button"] --> J["close agenda — EventForm grows from<br/>the button, prefilled 09:00–10:00 that day"]
```

- **Directional slide** (`DashboardView.tsx`) — a new `agendaSlideDir` state
  (`0 | 1 | -1`). `shiftAgendaDay()` — the single helper behind both the `useDrag` swipe
  handler and the header chevrons — sets it to `±1` before swapping the date; `MonthView`'s
  `onDayClick` resets it to `0` on a fresh open so the modal's own scale-in doesn't double
  up with a slide. The modal body wraps `AgendaView` in a div **keyed by the displayed
  day**, carrying `agenda-slide-next` (next day: in from the right) or `agenda-slide-prev`
  (previous day: in from the left) per direction. The day-keyed remount restarts the
  animation from frame 0 on every change; on close the key stays stable via the existing
  `displayAgendaDate` hold, so the shrink-out never replays the slide.
- **CSS** (`src/app/globals.css`) — `@keyframes agenda-slide-in-next/prev` (opacity
  0.3 → 1 with `translateX(±48px) → 0`), applied at 220ms
  `cubic-bezier(0.22, 1, 0.36, 1)` inside the existing
  `@media (prefers-reduced-motion: no-preference)` block — reduced-motion users get the
  instant swap (same gating convention as `.content-enter`).
- **Swipe behavior unchanged** — same `useDrag` options (`axis: "lock"`, 48px release
  threshold, tap/`pointercancel` guards, one-shot click suppression), so event-row taps
  still open `EventDetail` and a sub-threshold wiggle neither changes the day nor
  mis-opens an event. Cross-month swipes keep the modal open and re-navigate `?month=`
  (Phase 2j); a day in the not-yet-fetched month briefly shows "No events" until the
  re-fetch commits — the pre-existing limitation, unchanged.
- **Create-event button** — a full-width primary `Button` ("New event", `IconPlus` left
  section) below the agenda list, `disabled` while Google is unconfigured (same guard as
  the FAB; opening the form would only save into the stub integration). The swipe wrapper
  becomes the list's scroll area — `overflowY: auto`, `maxHeight: 56dvh`,
  `overscrollBehavior: contain`, with `touchAction: "pan-y"` and the capture-phase swipe
  click guard unchanged — so a long day scrolls internally and the header + button always
  fit inside the modal's `90dvh` content cap.
- **Button wiring** — on click: `setAgendaDate(null)` +
  `openCreate(agendaViewDate, buttonRect)` — the agenda shrinks away and the event form
  scales in from the button (the same origin-rect pattern as the FAB and the
  EventDetail → Edit flow), prefilled with the viewed day via `EventForm`'s existing
  `defaultDate` behavior (09:00–10:00). Saving runs `onDone` → `router.refresh()` and the
  new month event appears in the grid.
- **Decisions (user-confirmed)** — the simple directional slide was chosen over a
  finger-follow carousel (no live 1:1 pan; the day still commits on release), and the
  button lives below the list rather than as a header icon.
- **Not touched** — the Agenda *tab* view remained a separate full-screen mode without a
  swipe (it got the same treatment in [1.65](#165-agenda-tab-day-swipe--slide-phase-3y)),
  month grid, data flow/cache, `EventForm`, `EventDetail`. No schema change.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (355), and `pnpm build` all
  pass; no `db:generate` drift. Manual on-device checks owed: swipe + chevron slide
  directions, tap-vs-swipe disambiguation, cross-month swipe, and the button
  open → create → refresh path.

## 1.65 Agenda-tab day swipe + slide (Phase 3y)

The dashboard's **Agenda tab** (`?view=agenda`) changed days only through the header
‹/› chevrons (and Today / Select date), each a full data navigation — so every day
change flashed the grid skeleton and faded back in, and there was no swipe at all. It
now has the same day-swipe gesture + directional slide-in as the Month-view day modal
(§1.64), and in-month day changes are instant (optimistic local state) instead of
skeleton-backed.

```mermaid
flowchart LR
    A["Agenda tab (viewedDay state)"] -- "swipe left/right" --> B{"release ≥ 48px?"}
    A -- "‹ › / Today / Select date" --> C["applyAgendaDay(next)"]
    B -- yes --> C
    B -- no --> D[no day change]
    C -- in-month --> E["setViewedDay + slide dir ±1<br/>bare router.push(?date=)<br/>— no pending flag, no skeleton"]
    C -- cross-month --> F["slide dir 0, navigate(?date=, ?month=)<br/>data navigation"]
    E --> G["day-keyed div remounts →<br/>220ms directional slide-in"]
    F --> H["AgendaListSkeleton (≥350ms)<br/>then reveal fade"]
    E -. "URL re-render (same month,<br/>L1/cached read)" .-> G
```

- **Local day source of truth** (`DashboardView.tsx`) — new `viewedDay` state
  (`string | null`; null = follow the `?date=` prop) plus `agendaUrlBase` state (the `?date=`
  prop value before the tab's last write). A render-phase sync block (the same
  setState-during-render pattern as the modal's `displayAgendaDate` hold) keeps the two
  in agreement: null seeds `viewedDay` from the prop on entry; an external `?date=`
  change (back/forward, deep link, re-entry) wins and re-seeds it; while one of the tab's
  own writes is still in flight (the prop still holds the pre-write value) the local day
  is kept; when the prop catches up (`viewedDay === date`) the base ref clears.
  `switchView` resets `viewedDay`/base ref when entering or leaving the tab (entry also
  clears the slide dir so a fresh entry plays the reveal fade, not a stale slide).
- **Single URL writer** — `applyAgendaDay(next)` (no-op early return when `next` equals
  the viewed day, so "Today" while on today is silent): in-month it sets `viewedDay` +
  the slide direction (sign of the day move) and syncs `?date=` with a **plain
  `router.push` outside `startTransition`** — a no-transition push never sets this
  component's pending flag (the `?edit=`/`?refresh=` strips rely on the same behavior),
  and a same-month `?date=` change has no new fetch identity, so the page re-renders
  silently behind the instant slide. Cross-month it clears the slide dir and runs the
  usual `navigate({ date, month })` data navigation — skeleton + `useContentEnter`
  reveal fade, exactly like the parade-state cross-month exception (now noted alongside
  it in `AGENTS.md`'s loading checklist).
- **Swipe** — a second `useDrag` instance (same options as the modal: `axis: "lock"`,
  `axisThreshold: 8`, `threshold: 10`, `filterTaps: true`, same 48px release threshold,
  tap/`pointercancel` guards, and the shared `swipedRef` one-shot click suppression —
  the two drag refs never attach at once, so the flag is safe to share). The agenda grid
  branch now wraps `AgendaView` in a drag div (`touchAction: "pan-y"`, `overflow: hidden`
  to clip the ±48px slide, capture-phase click guard) containing a **day-keyed div**
  carrying `agenda-slide-next`/`agenda-slide-prev` — the shared §1.64 keyframes (reused
  verbatim; reduced-motion gated). `rangeStart`/`rangeEnd` now key off the viewed day.
- **All day navigation routes through the writer** — the header ‹/› chevrons, the
  kebab menu **Today** item, and the ⋮ **Select date** picker (seeded from the viewed
  day; its `onPick` now calls `applyAgendaDay` on this tab) all take it, so chevrons and
  swipes are visually identical (instant slide in-month — a side-benefit fix, since the
  old chevron path skeleton-flashed even in-month) and the picker/Today keep the
  same-month vs cross-month split. The header label, the "Today"/`onToday` compare, and
  the picker's `selectedDate` all read `headerDate` (`viewedDay` on the agenda tab, the
  prop otherwise) instead of the raw `?date=` prop.
- **FAB** (user-confirmed) — the page-level "New event" FAB prefills the event form with
  the **viewed day** while on the Agenda tab (`isAgenda ? headerDate : today`), matching
  the day modal's button; all other views keep "today".
- **Unchanged** — the Month-view day modal (its own `agendaDate`/`shiftAgendaDay` path
  is untouched; the shared `agendaSlideDir`/`swipedRef` are never driven by both
  surfaces at once), the Day/Week/Month views, the `?date=`-derived `?month=` page
  fetch, filters, force refresh, `?edit=` deep links, and the cache layer. A same-month
  push re-renders the page with a fresh `events` array, but the keyed div's key is
  unchanged so a running/finished slide never replays. No schema change.
- **Not touched** — no new pure helpers were extractable (the writer is client URL glue),
  so no new unit tests; the full existing suite must stay green.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (355), and `pnpm build` all
  pass; no `db:generate` drift. Manual on-device checks owed: Agenda-tab swipe both
  directions (instant slide, no skeleton in-month), cross-month swipe (skeleton → fade),
  chevron/Today/picker parity, refresh/back/tab-re-entry day resolution, event taps
  after a botched swipe, and the FAB prefilling the viewed day.
- **Bugfix (render-phase setState infinite loop):** switching to the Agenda tab crashed
  with *"Too many re-renders"* (React limits renders at 50). The reconcile's final
  branch called `setAgendaUrlBase(null)` on **every** agenda render (even when it was
  already `null`), and a render-phase `setState` never bails out on equal values — the
  eager-state `Object.is` bail-out in React's `dispatchSetState` only exists on the
  non-render-phase path, so every dispatch scheduled another render until the limit.
  Fixed by guarding the dispatch with `agendaUrlBase !== null` (the other reconcile
  branches and the modal's `prevAgendaDate` hold were already value-guarded). Verified
  against the installed `react-dom-client.development.js` (`renderWithHooksAgain` +
  `enqueueRenderPhaseUpdate`). `pnpm lint/typecheck/test (355)/build` pass.

## 1.66 Week v2 matrix view (Phase 3z)

The dashboard gains a fifth view — **Week v2** (`?view=weekv2`) — a week matrix: the X axis
is the week (7 columns, one day per column, Monday-first) and the Y axis is one row per
user plus a department row per selected department (same rows as the Day/Week resource
views). Each cell stacks up to two event-title chips (Mantine "light" variant colors, like
the schedule views) with a "+N more" overflow. **No Mantine Schedule component fits this
shape** — verified against the installed `@mantine/schedule@9.5.1` API: `WeekView` has no
user axis, `ResourcesWeekView`'s columns are 24-hour time lanes (1440px/day scroll), and
`ResourcesMonthView` is day-columns × user-rows but always spans the whole month (28–31
columns). The matrix is therefore a custom CSS-grid component.

```mermaid
flowchart LR
    A["?view=weekv2 + ?date="] --> B["page: weekDays(date)<br/>fetchRangeEvents (2-month span)<br/>— same cache path as Week"]
    B --> C["buildWeekLanes (pure, tested)<br/>rows = creator ∪ tagged users<br/>∪ dept:&lt;calendarId&gt;; multi-day<br/>events as WeekSpan, greedy lanes"]
    D["buildScheduleResources (pure)<br/>dept row + user rows, groups"] --> E["WeekMatrixView<br/>7 day columns × resource rows"]
    C --> E
    E -- "banner tap" --> F["EventDetail modal"]
    E -- "empty cell tap" --> G["EventForm<br/>prefilled that day"]
```

- **Data** (`page.tsx`) — one parse branch (`weekv2`) and one fetch condition
  (`view === "week" || view === "weekv2"` → `weekDays(date)` → the existing
  `fetchRangeEvents` 2-month range read). No new fetch, cache, filter, or force-refresh
  logic — Week v2 inherits all of it.
- **Pure helper** (`src/lib/events/weekMatrix.ts`, 16 unit tests) —
  `coveredDays(event, week)`: the week days an event occupies (all-day end dates are
  exclusive → `subOneDay`; timed events span start..end dates; clamped to the week) and
  `buildWeekLanes(events, week)`: maps `(rowId → WeekLane[])` using the schedule views'
  row semantics (`rowsForEvent`; external events pin to their calendar's department row),
  with each event placed as a `WeekSpan` (inclusive startDay/endDay indexes) and
  non-overlapping events within a row packed into lanes via greedy interval partitioning
  (sort by startDay → start time → title, then place each span in the first lane whose
  last span ends before it starts).
- **Component** (`WeekMatrixView.tsx`, client) — a **pinned 7-day header** (today filled
  primary/bold, weekends red, matching the Week view's day-label language) over
  per-department **flex blocks** sharing one day-column template
  (`repeat(7, minmax(112px, 1fr))`): the day columns have a
  minimum width of 112px so event banners are readable. The table is **full-height** — no
  vertical clamp (the page scrolls), only the horizontal scroll stays internal via the
  ScrollArea `content minWidth`; the day header is a **pinned strip outside the scroll
  area** that sticks to the viewport below the view tabs (`DashboardView` measures the
  `Tabs.List` height and passes `tabBarOffset`; the strip is `top: calc(var(--app-shell-header-offset)
  + tabBarOffset)`) and follows the table's horizontal scroll via a `translateX(-scrollLeft)`
  transform applied directly on `onScrollPositionChange` (no per-frame re-render). The **left
  labels are pinned during horizontal scroll** like the Day/Week schedule views: each
  department block is a flex row with a sticky-left group label (`left: 0`, vertical-rl,
  stretching the block's height) and each resource row is a flex row with a sticky-left
  shortname label (`left: 1.5rem` when a group column exists) beside the shared day grid
  (sticky labels paint above the banners at `z-index` 5/6 vs 1, but below the pinned header
  at 10). Each resource row's day grid is the 
  scrolling part; rows are ~36px-min lanes (compact but
  still comfortable touch targets) with spanning
  event banners (single title chip per event, occupying every covered day column), a
  banner tap opens `EventDetail` (shared origin-rect pattern), and an empty-cell tap opens
  the event form prefilled with that day (guarded by `googleConfigured` like the FAB).
- **Wiring** (`DashboardView.tsx`) — `ViewMode` + a fifth tab (`IconLayoutGrid`, compact
  nowrap label) after Week. `isWeek` now covers both week views (week label, ‹/› =
  `shiftWeek`, `onToday`), and Week v2 joins `isAnchoredView` (day-anchored: starts on
  today, "Select date" offered, month kept when leaving). The `WeekDayLabelStrip` and
  the slot-width measurement effect stay exclusive to the timeline Week view; the
  loading branch reuses `WeekGridSkeleton` (its label + 7-day-lane shape already matches);
  `loading.tsx`'s tab-strip skeleton goes 4 → 5.
- **Decisions (user-confirmed)** — new 5th top tab (not a sub-toggle in the Week tab, not
  a replacement); title chips with overflow (not availability dots); empty-cell tap
  creates the event for that day.
- **Out of scope** — swipe-to-shift-week (chevrons/Today/Select date suffice for v1),
  start times inside chips.
- **Unchanged** — the timeline Week view, Day/Month/Agenda views, events cache, filters,
  force refresh, `?edit=` deep links. No schema change — `db:generate` no drift.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (369), and `pnpm build` all
  pass. Dev-server smoke: `/login` 200, `/dashboard?view=weekv2` 307 → login (auth
  redirect, expected unauthenticated). Manual on-device checks owed: chip/overflow/
  empty-cell taps, today + weekend highlighting, multi-day events spanning cells,
  group-column alignment with ≥2 departments, and the 5-tab strip on a 360px viewport.

## 1.67 Filter quick actions in the 3-dot menus (Phase 3aa)

The one-tap filter actions are now available directly from the page-level ⋮ menus (the
dashboard and parade-state header kebabs — the two surfaces that open the filter dialog),
while the dialog keeps its own quick-action button. Both surfaces share the **"My
Events"** toggle: narrowing the Users filter to the current user.

- **Menu shape** — the three filter items sit under a `Filters` `Menu.Label` group:
  a **"My Events"** `Menu.CheckboxItem` (checked when the Users filter is exactly the
  current user; toggles it on/off immediately; hidden when the current user isn't a
  filter option), a **Clear** `Menu.Item` (disabled when no filter is active; nulls
  `cal`/`users`/`types` so the server default — a non-admin's own department — is
  restored), and **More Filters** (renamed from "Filters", keeps the active-count badge,
  opens the `FilterModal`).
- **`Menu.CheckboxItem` quirk** — checkbox items don't close the menu on click by
  default, so "My Events" sets `closeMenuOnClick`; plain `Menu.Item`s close by default.
  There is no `Menu.Group` in Mantine v9 (removed in v7) — grouping uses `Menu.Label` +
  `Menu.Divider`.
- **Dashboard** (`DashboardView.tsx`) — `onlyMeActive`/`onlyMeAvailable` derived from
  `selectedUserIds`; `toggleOnlyMe` → `navigate({ users: checked ? currentUser : null })`;
  `clearFilters` → `navigate({ cal: null, users: null, types: null })` (a server data
  navigation, skeleton + fade, like any filter change). The menu keeps its existing
  Today / Select date / divider / Force refresh structure.
- **Parade State** (`ParadeStateView.tsx`) — the view mirrors URL filter state locally
  for optimistic applies, so `toggleOnlyMe`/`clearFilters` update `selectedUsers`/
  `selectedCalendars` *then* navigate (no skeleton), mirroring `handleApplyFilters`.
- **`FilterModal`** — unchanged from before this phase: the **"My Events"** quick action
  still renders via the `FilterGroup.action` slot as a button beside the Users group
  label (draft-scoped — `isApplied`/`apply` read the draft, not the applied URL state),
  and the dialog keeps its own draft **Clear** (reset + Apply). `resolveFilterApply` and
  its tests are untouched.
- **Unchanged / out of scope** — the `/settings/audit-log` ⋮ menu (its dropdown *is* the
  filter panel — inline selects + dates + "Reset filters"; nothing to extract or rename),
  the icon-only `FilterButton` in the Users settings header (no ⋮ menu), the trigger
  badge / `activeFilterCount` logic, and the dialog title ("Filters"). No schema change —
  `db:generate` no drift.

```mermaid
flowchart LR
    A["⋮ menu<br/>Today / Select date"] --> B["Filters (Menu.Label)"]
    B --> C["My Events<br/>Menu.CheckboxItem<br/>?users=&lt;me&gt; / null"]
    B --> D["Clear<br/>cal/users/types = null"]
    B --> E["More Filters [n]<br/>opens FilterModal"]
    E --> F["FilterModal<br/>My Events quick action (draft)<br/>+ Clear + Apply"]
```

- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass. Manual dev-server
  smoke owed: dashboard + parade-state — toggle "My Events" on/off in the ⋮ menu (badge +
  checkmark, `?users=` in the URL), Clear (badge → 0, defaults restored), More Filters
   opens the dialog where the "My Events" quick-action button and the in-dialog Clear
   still work.

## 1.68 Event location polarity fix (bugfix)

The Location input in the edit event modal "did not work at all": on
`out`-policy event types the destination box looked editable, but whatever was
typed never appeared in the calendar preview and was silently discarded on
save. Root cause: §1.46 shipped `clampOutOfCamp` with the location polarity
inverted relative to the intended semantics. User-confirmed intent (this
phase): **the location is the out-of-camp destination — in-camp events always
have a blank location.** The form's visible behavior (input enabled only while
out of camp, cleared when switched back in) already matched that polarity; the
clamp — the single enforcement point — did not.

```mermaid
flowchart LR
    P["event_types.location_policy<br/>in · out · both"] --> C["clampOutOfCamp (fixed)<br/>in → flag off, location ''<br/>out → flag on, location kept<br/>both → location only while out of camp"]
    C --> F["EventForm<br/>checkbox + location box<br/>(unchanged — already correct)"]
    C --> A["createEvent / updateEvent<br/>resolveEventLocation (silent clamp)"]
    A --> G["Google event<br/>location field"]
```

- **`clampOutOfCamp`** (`src/lib/events/locationPolicy.ts`) — the `out` branch
  now **keeps** the location (`{ outOfCamp: true, location }`; previously
  wiped it — the cause of the silent data loss), and the `both` branch records
  the location **only while out of camp** (`outOfCamp ? location : ""`;
  previously a full passthrough that could leak an in-camp location). The `in`
  branch is unchanged (`{ false, "" }`). Because the clamp is the single
  enforcement point, the edit prefill, the type-switch re-clamp, and both
  server actions pick up the corrected rule with no changes of their own —
  the form's `disabled` condition, the checkbox change handler, and the live
  preview were already correct and are untouched.
- **Event form** (`EventForm.tsx`) — the `both`-policy checkbox description
  flips from "Out-of-camp events have no location" to "In-camp events have no
  location; out of camp takes place at a location" (it previously contradicted
  the field right below it).
- **Docs comment sync** — `LOCATION_POLICY_DESCRIPTIONS.out` ("the location
  records the destination"), the `locationPolicy.ts` module header + function
  doc, `actions.ts` (`resolveEventLocation`), `validate.ts` (`outOfCamp` /
  `location` field docs), `notes.ts` (`EventNotes.outOfCamp`), `AGENTS.md`
  (clamp matrix + `{location}` token note: "blank for in-camp events").
- **Tests** — `locationPolicy.test.ts`: the `out` case now expects the
  location kept; the `both` in-camp case now expects it cleared.
- **Consequences** — destinations previously silently erased for `out`-policy
  events are gone from Google (nothing to recover or migrate). External/legacy
  **in-camp** events with a Google `location` still display it, but the next
  in-app edit blanks it (consistent with in-camp = blank).
- **Unchanged / out of scope** — the location stays **optional** (the
  Location step has "no required fields" per §1.47); a required-destination
  validation for out-of-camp events is deferred. No schema change.
- Verification: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (369) all pass.
  Manual dev-server smoke owed: edit an out-of-camp event (`out`-policy type)
  — destination box enabled + prefilled, typed value shows in the calendar
  preview, save persists it (detail modal + Google location); on a `both`-type
  event, checking Out of Camp enables the box and unchecking clears +
  disables it; in-camp events keep the box disabled.

## 1.69 Remembered UI state across relaunch (Phase 3ab)

The app "forgot" everything on relaunch: a PWA cold start lands on `/`,
redirected to `/dashboard` with the pure defaults (Month view, today, role-
default calendars) regardless of where the user last was. This phase persists
the last bottom-nav page, the dashboard's view tab + displayed day/month +
Cal/Users/Types filters, and the parade-state day + Cal/Users filters so a
relaunch (or F5) lands exactly where the user left off.

**Design decision (user-confirmed):** storage is **per-device** (a single
client-owned cookie, `cloudy2.ui`) — not a per-user DB row — so there is no
schema/migration work and it works offline; the remembered state does not
follow the user to another device. Scope: dashboard + parade state + last
page (settings sub-tabs included); audit-log filters are out of scope and can
join later with the same mechanism.

```mermaid
flowchart LR
    subgraph client ["Client (writes)"]
        AS["AppShellShell<br/>useRememberedPage(pathname)"]
        DV["DashboardView<br/>usePersistUiState('dashboard', resolved props)"]
        PV["ParadeStateView<br/>usePersistUiState('parade', resolved props)"]
        NM["navigate(): drops a remembered key?<br/>→ auto-inject one-shot ?_fresh=1"]
        AS --> W["writeUiState() — read-modify-write<br/>document.cookie 'cloudy2.ui' (base64url JSON)"]
        DV --> W
        PV --> W
        NM --> NAV["router.push(...)"]
    end
    subgraph server ["Server (reads, pre-paint)"]
        RT["/ (start_url)<br/>resolveLaunchTarget(lastPage, role)<br/>→ redirect to last page"]
        DP["/dashboard page.tsx<br/>view/date/month/cal/users/types:<br/>URL param → cookie → role default"]
        PP["/parade-state page.tsx<br/>date/cal/users:<br/>URL param → cookie → default"]
        COOK[("cookie 'cloudy2.ui'")]
        COOK --> RT
        COOK --> DP
        COOK --> PP
    end
    NAV -- "full load / RSC request" --> COOK
```

- **Core modules** — `src/lib/ui/uiState.ts` (pure, unit-tested): the
  `UiState` shape, `encodeUiState`/`decodeUiState` (base64url(JSON), padding-
  tolerant, safe `atob`/`btoa` + `TextEncoder` so the codec is shared by
  server, client, and node tests), `normalizeUiState` (drops mismatched
  shapes; empty id lists = "unfiltered" → role default), `mergeUiState`,
  `freshMarkerNeeded(updates, keys)`, and `resolveLaunchTarget(lastPage,
  role)` — a whitelist of `/dashboard`, `/parade-state`, `/contacts` plus the
  six `/settings/*` sub-tabs (admin-only; unknown/garbage → `/dashboard`).
  `src/lib/ui/uiStateClient.ts` ("use client"): `writeUiState` (RMW with a
  ~3.5 KB size guard that degrades by dropping id lists), `clearUiState`,
  `usePersistUiState(section, values)`, `useRememberedPage(pathname)`.
- **Server consumption** — `src/app/page.tsx` became async: `getSession()` +
  the cookie → `redirect(resolveLaunchTarget(...)`, so a cold open of
  `start_url /` bounces to the last page **before first paint** (no JS, no
  flash; unauthenticated falls through to the `/login` redirect as before).
  Dashboard/parade `page.tsx` apply the cookie as a **per-key fallback
  exactly like the URL params** (same pattern/validation, so stale calendar/
  user ids drop out the same way). Dashboard specifics: a remembered `date`
  only applies when the resolved view is day-anchored (Week/Week v2/Day/
  Agenda) — in Month view the remembered `month` drives the read; and the
  cookie is skipped entirely for `?edit=` deep links (explicit intent).
- **The `_fresh` one-shot marker** — the subtle case: "Clear" and the tab
  switch off an anchored view produce a *bare* URL, which the cookie fallback
  would immediately re-apply the just-deleted state on. Both views'
  `navigate()` auto-inject `?_fresh=1` whenever a remembered key maps to
  `null` in the updates (pure `freshMarkerNeeded`; the dashboard checks the
  no-op condition *before* injecting, so "re-removing" an absent key stays a
  no-op); the server treats `_fresh` as "render with pure defaults this
  once", and a self-terminating strip effect (same pattern as the
  `refresh`/`edit` strips) removes it from the URL. Because
  `usePersistUiState` writes the **server-resolved props** (not raw URL
  params) on every render, the cookie converges to exactly what was displayed
  right after the flagged render — no per-handler pre-writes needed.
- **Sign-out** — `UserMenu` calls `clearUiState()` before `signOut()`, so the
  remembered state never bleeds across accounts on a shared device.
- **Unit tests** — `src/lib/ui/uiState.test.ts` (20 tests): codec round-trips
  (incl. padded input, base64url alphabet), garbage → null, shape
  normalization, empty-list-to-absent, merge semantics,
  `freshMarkerNeeded`, and the `resolveLaunchTarget` matrix (roles, sub-tabs,
  junk).
- **Consequences / known edges** — state is per browser/origin (no cross-
  device sync by decision); a fresh account on a device that just signed out
  starts from defaults (cookie wiped); if a remembered calendar no longer
  exists it is silently dropped on read (self-healing, the next render
  re-persists the reduced set). The `?_fresh` strip is plain-push, no
  skeleton — consistent with the other one-shot strips.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm build` (Turbopack, `/`
  correctly becomes dynamic), and `pnpm test` (391) all pass. Live dev-server
  smoke against the Neon dev DB (curl + hand-made cookie, logged in as
  admin): `/` with no cookie → 307 `/dashboard`; with
  `lastPage=/parade-state` → 307 `/parade-state`; admin
  `lastPage=/settings/audit-log` → 307 `/settings/audit-log`; junk
  `lastPage` → 307 `/dashboard`; bare `/dashboard` with remembered
  `{view:week, date:2026-08-17}` renders the week "Aug 17 – 23, 2026" (no
  client redirect); the same cookie with `?_fresh=1` renders the default
  Month view; bare `/parade-state` with remembered `date=2026-08-10` renders
  that day; `?view=agenda&date=2026-09-05` beats the cookie (URL always
   wins). Manual PWA relaunch on a phone (kill app → tap icon → last page with
   filters) remains the final user-facing confirmation.

## 1.71 User filter narrows the resource rows (bugfix)

**Symptom** — the dashboard's **Users** filter had no visible effect on the
**Day**, **Week**, and **Week v2** tabs: applying it left all user rows in
place and most events unchanged, so it "looked like no filter has been
applied". Month/Agenda were unaffected (no rows to mislead).

**Root cause** — the filter always narrowed the *event data* correctly
(server-side `eventMatchesUserFilter` in `fetchRangeEvents`), but the three
resource-row views ignored it for *rows*:

1. `buildScheduleResources` rendered every user of the selected departments
   plus the department rows — the Phase 2s scope decision ("the filter selects
   which **events** render only; the schedule view's resource rows are
   unchanged", §1.28).
2. `expandScheduleEvents` (Day/Week) and `buildWeekLanes` (Week v2) place each
   surviving event on **every** row it applies to — the creator's row, all
   co-tagged users' rows, and the tagged department rows. Filtering to "John"
   therefore still showed his events in his creators'/co-tagged rows and
   department rows, with every label still on screen → reads as unfiltered.

```mermaid
flowchart TD
    A["?users=&lt;ids&gt; active"] --> B["buildScheduleResources(userFilter) (NEW)"]
    B -->|"rows = selected users only<br/>grouped by their own dept, no dept rows"| C["Day / Week / Week v2 grid"]
    A --> D["fetchRangeEvents userFilter (unchanged)"]
    D --> E["events narrowed to creator/tagged matches"]
    E --> F["expandScheduleEvents / buildWeekLanes (unchanged)"]
    F --> G["placements for hidden rows are ignored<br/>(Mantine keys events on rendered resources;<br/>matrix reads lanes of rendered rows only)"]
    G --> C
```

**Fix (behavior user-confirmed)** — when the Users filter is active, the three
views render **only the selected users' rows** (no department rows, no other
users). Each surviving event then lands only on its selected users' rows, so
the grid visibly changes; "My Events" collapses to your single row. Month,
Agenda, and Overview are untouched (the Overview "`?users=` never narrows
rows" contract from its fix section stands).

- **`buildScheduleResources`** (`src/lib/events/schedule.ts`) — new
  `userFilter?: string[]` param. Non-empty → `buildFilteredScheduleResources`:
  one row per selected user present in the roster (shortname/name labels and
  name ordering unchanged), grouped under the user's **own** department — so a
  selected user gets a row even when that department is outside the `cal`
  selection (row source becomes the full active roster); department rows and
  the tagged-department pinning are skipped (events without people data are
  already excluded by the data filter); unassigned selected users land in a
  trailing `Unassigned` group; selected ids missing from the roster are
  skipped; groups are only emitted when more than one group has rows.
  Empty/absent filter → exactly the previous behavior (existing tests
  unchanged).
- **View wiring** — `dashboard/page.tsx` passes a new `allActiveUsers` prop
  (full active roster, `ScheduleUser` shape); `DashboardView` switches the
  row build to `{ departments: calendars, users: allActiveUsers, userFilter:
  selectedUserIds }` when the filter is active, keeping the previous
  `scheduleDepartments`/`scheduleUsers` build otherwise.
- **No expansion/lanes changes** — verified against `@mantine/schedule` 9.5.1
  (`get-resources-day-view-events`: events are keyed per rendered resource and
  `if (!(event.resourceId in eventsByResource)) continue;`), so Day/Week drop
  placements for hidden rows implicitly; `WeekMatrixView` only reads
  `laneMap.get(resource.id)` for rendered rows, so hidden rows' lanes are
  never used.
- **Empty state** — zero rows under an active filter show
  "No active users match the Users filter. Adjust the filter." (the no-filter
  message is unchanged).
- **Unit tests** — `src/lib/events/schedule.test.ts`: six new cases (single
  user → row only, no dept row; dept rows dropped even when events tag the
  department; multi-department grouping; unknown ids skipped; unassigned group;
  no selected user in roster → no rows).
- **Revises** the Phase 2s scope decision (§1.28, "rows unchanged") for the
  three resource views; the data-level matching semantics are untouched.
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (418), and
  `pnpm build` all pass (no schema change). Manual phone smoke owed: apply a
  Users filter / "My Events" on each of Day/Week/Week v2 → only the selected
  users' rows remain and events appear only in them; Clear restores the full
  row set.

## 1.72 Pinned dashboard view tabs (Phase 3ac)

Users can pin their preferred calendar view tabs. A **"Pin Tab"** `Menu.Item`
in the dashboard's header 3-dot menu (the same menu on every dashboard view,
placed after "Select date" and before the Filters group; state-based — **"Pin
Tab"** with an outlined `IconStar` when unpinned, **"Unpin Tab"** with a filled
`IconStarFilled` when pinned) pins/unpins the *currently active* tab. Pinned
tabs render **first** in the tab bar in pin-recency order — the last pinned tab
is leftmost — with a filled star icon (`IconStarFilled`, 14px) prefixed to
their tab name; unpinned tabs keep the default order (Month → Week → Week v2 →
Day → Agenda).

**Design decision (user-confirmed):** storage is **per-device** in the existing
`cloudy2.ui` cookie (§1.69) as `dashboard.pinnedViews: string[]` — index 0 is
the most recently pinned tab. No schema work; pins clear on sign-out with the
rest of the UI state.

```mermaid
flowchart LR
    M["⋮ menu<br/>Pin Tab / Unpin Tab<br/>(Menu.Item, star icon leftSection)"] --> S["local state 'pinned'<br/>(render-phase sync follows prop)"]
    S --> O["orderDashboardViews(pinned)<br/>pinned first (recency) + defaults"]
    O --> T["Tabs.List<br/>ordered tabs, SSR-correct order"]
    S --> W["usePersistUiState('dashboard', …<br/>pinnedViews: pinned)"]
    W --> C[("cookie 'cloudy2.ui'<br/>dashboard.pinnedViews")]
    C --> P["dashboard/page.tsx<br/>normalizePinnedViews()<br/>— read even on _fresh/edit"]
    P --> S
```

- **Pure helpers** (`src/lib/ui/uiState.ts`, unit-tested) —
  `DASHBOARD_VIEW_VALUES` (the five tab values in default order),
  `normalizePinnedViews(value)` (only known views survive, de-duplicated,
  stored order preserved), and `orderDashboardViews(pinned)` (pinned first in
  stored/recency order, then the unpinned defaults). `normalizeUiState` keeps
  `dashboard.pinnedViews` when non-empty. `DASHBOARD_STATE_KEYS` deliberately
  **excludes** the key: pins are not URL-backed, so pinning never navigates and
  never triggers `_fresh`.
- **`_fresh` carve-out** (the subtle part) — every tab switch is a `_fresh`
  render, and `page.tsx` normally nulls the whole cookie for `_fresh`/`edit`
  renders. Reading pins through that path would wipe them on the next tab
  switch. The page now decodes the cookie once (`cookieState`) and resolves
  `pinnedViews` from it **in all render modes**; only the URL-backed keys
  honor the skip.
- **Server** (`dashboard/page.tsx`) — `pinnedViews` prop on `DashboardView`
  (validated = the tab order is correct in the SSR HTML, no reorder flash).
- **Client** (`DashboardView.tsx`) — the five hardcoded `Tabs.Tab` blocks
  became `orderDashboardViews(pinned).map(...)` over a `VIEW_TAB_META`
  `{label, icon}` map (Week v2 keeps its `nowrap` label). Pin state is local
  (`useState`, seeded from the prop) with a render-phase content-compare sync
  (the codebase's existing "adjust state on prop change" pattern) so
  back/forward re-resolves win over a stale local toggle while a fresh local
  toggle the cookie hasn't re-confirmed yet is never clobbered. Toggling runs
  `setPinned(pinned.includes(view) ? pinned.filter(…rest) : [view, …pinned])` —
  no navigation, so no skeleton and no `_fresh`; persistence rides the existing
  `usePersistUiState` write
  (the dashboard section now always includes `pinnedViews`, so the
  whole-section `mergeUiState` replacement stays lossless).
- **Overflow guard** (`uiStateClient.ts`) — the >3.5 KB degrade branch now
  keeps `pinnedViews` alongside view/date/month (it's ≤5 short strings).
- **Tests** — `uiState.test.ts`: round-trip incl. `pinnedViews`; normalize
  (non-arrays, unknown/junk, duplicates, empty); `orderDashboardViews`
  (default order, single pin first, multi-pin recency, unknowns ignored,
  all-pinned). Suite 426.
- **Unchanged** — parade-state (no tabs), the tab-switching navigation
  (`switchView`), the active-tab scroll-into-view effect (pinning never changes
  the active tab), the `?view=` URL param (pinning is display-only — a pinned
  tab is still addressed by `?view=` exactly as before). No schema change —
  `db:generate` no drift.
- Verification: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (426) all pass.
  Manual on-device checks owed: pin a view → it jumps leftmost; pin a second
  → it goes first (first pinned drops to second); unpin → default order
  returns; F5 / PWA relaunch keeps the order on first paint; tab switches
  don't clear pins; the menu label/icon + tab star survive the menu
  close/reopen on the new tab; sign-out clears the pins.

## 1.73 Legible audit log details (Phase 3ad)

The audit log recorded *what happened* but often not *what it was about*.
Event creates had no date/time at all, event updates stored a flat "new
state" (impossible to tell what changed), deletes named the entity by its raw
Google event id, and every non-diff payload rendered as raw JSON in the
Details modal. Now every `details` payload is human-readable: display names
instead of UUIDs, pre-formatted datetimes, enum labels, and true before/after
diffs for updates.

**Design decisions (user-confirmed):** event updates render **diff + full
after-state** (changed fields as before→after, then a "Resulting state"
section); invitees/departments are stored as **names**, not counts; the
snapshot `title` is the **rendered Google title** (what users see) plus a
separate raw `description`; the empty-value marker is `—`.

```mermaid
flowchart TD
    A["updateEvent / deleteEvent"] --> B["reconcile loop over target calendars"]
    B --> C["findCopies (now returns full GcalEventItem[])"]
    C --> D["first existing copy<br/>= pre-change state"]
    D --> E["snapshotFromCopy<br/>(title = copy summary;<br/>description/type/timeOption/<br/>AM-PM/outOfCamp/location from notes)"]
    F["form values + name lookups<br/>(calendarNames, getUsersByIds)"] --> G["buildEventSnapshot<br/>(renderEventTitle, names,<br/>pre-formatted time)"]
    E --> H["diffFields(before, after) + eventId"]
    G --> H
    H --> I[("audit_logs.details (jsonb)")]
    I --> J["formatAuditDetails<br/>changes / fields / json"]
    J --> K["Details modal:<br/>context values · before→after lines<br/>· Resulting state"]
```

- **Pure snapshot module** (`src/lib/events/eventAudit.ts`, new, unit-tested in
  `eventAudit.test.ts`) — `EventAuditSnapshot` type
  (`{ title, description, type, time, outOfCamp, location, departments,
  invitees, creator }`), `formatEventAuditTime(parts)` (range:
  `2026-08-21 14:00 – 15:30` / `2026-08-21 14:00 – 2026-08-23 09:30`; full:
  `2026-08-21 (AM)`, `2026-08-21 (AM–PM)`, `2026-08-21 (AM) – 2026-08-23 (PM)`;
  zero seconds dropped), `buildEventSnapshot(...)` (after-state from form values
  + id→name maps; blank title/description/type/location → null; unknown ids
  dropped), and `snapshotFromCopy(ref, copy, names, departmentIds)`
  (before-state from the edit/delete ref + the first Google copy found;
  times/people from the ref; `title` from the copy's Google summary — visible
  even for legacy/external/blank-description events — and
  description/type/time-option/AM-PM/out-of-camp/location from its notes, shown
  as `—` (`EMPTY_VALUE`) when the copy is missing or has no notes). The `title`
  itself is computed by the new pure `renderEventTitle(...)` helper in
  `src/lib/events/eventTitle.ts` (template substitution + raw-description
  fallback + (AM)/(PM) suffix), shared by the write path and the audit so the
  audited title always equals the Google summary.
- **Event actions** (`src/lib/events/actions.ts`) — `findCopies` now returns
  `GcalEventItem[]` (full items; callers use `item.id`) so update/delete can
  snapshot the pre-change state **without extra Google API calls** (the first
  copy found in the reconcile loop is captured before any mutation).
  `createEvent` details = snapshot + `eventId` + `googleEventIds`; `updateEvent`
  details = `diffFields(before, after)` + `eventId` (title/description/type/time/
  location/
  out-of-camp/departments/invitees/creator all diffed); `deleteEvent`
  `entityName` = event title (fallback "Untitled event", was the raw Google id)
  and details = the deleted event's snapshot + ids. `createEvent`/`updateEvent`
  `entityName` is now the rendered title too (was the blank raw description,
  which is why titled-but-blank-description events showed "Untitled event" /
  empty Details).
- **Display layer** (`src/lib/audit/format.ts`) — `formatAuditDetails` renders
  three shapes: `changes` (FieldDiff → before→after lines + other flat
  top-level keys as context value lines + the stored `after` record as a
  "Resulting state" section), `fields` (any flat object → label/value lines —
  covers creates, grants, purges, **and every legacy row already in the DB**),
  and a pretty-JSON fallback. New pure helpers: `fieldLabel` (key → label,
  incl. legacy keys like `targetCalendarIds`, `inviteeUserCount`) and
  `valueString(key, value)` (nulls → `—`, booleans → Yes/No, string arrays
  joined, `timeOption`/`timeOptions`/`locationPolicy` → their display labels).
- **Details modal** (`AuditLogView.tsx`) — renders value lines
  (`DetailValueList`), change lines, and the "Resulting state" section inside
  one scroll area; an empty diff shows "No changes recorded."
- **Roster actions** (`src/lib/roster/actions.ts`) — `createUser` details gain
  phone/email/birthday and the `department` **name** (was `departmentId` UUID);
  `updateUser` diffs `department` by name (both sides resolved, one
  `calendars` query); `setUserStatus` stores a before/after `status` diff;
  `deleteDepartment` stores the `googleCalendarId`; access grant/update/revoke
  store `{ email } + role field-diff` (—→role / old→new / old→—) — the previous
  role is read via the read-only `listCalendarAccess` before the mutation
  (not `listDepartmentAccess`, which reconciles and would add side effects to
  the mutation path); revoke now trims the email before removing it.
- **Event-type actions** (`src/lib/eventTypes/actions.ts`) — create/rename
  store time options and location policy as display labels ("Start & End",
  "Full Day", "In camp only", …) instead of raw enums.
- **Unchanged** — settings/auth/purge payloads (their display labels improved
  via `FIELD_LABELS` only), CSV export (embeds the raw JSON, which is now more
  readable anyway), `diffFields`/`buildAuditLog`/query layer, the audit table
  (no schema change — `db:generate` no drift). Pre-existing rows cannot be
  backfilled; they render best-effort through the new label map (still missing
  times, which were never stored).
- **Tests** — new `src/lib/events/eventAudit.test.ts` (17 cases: time
  formatting matrix, snapshot building, copy parsing incl. v3-notes round-trip
  and legacy fallbacks, `renderEventTitle` incl. the blank-description →
  template-title case); `format.test.ts` extended (labels, value rendering,
  flat/legacy rows, diff extras + after-state, empty diff). Suite 454.
- Verification: `pnpm lint` and `pnpm test` (454) pass; `pnpm typecheck` passes
  for all changed files (the project-wide run is currently blocked only by an
  unrelated uncommitted `DashboardView.tsx` `Tooltip events` prop type error).
  Manual on-device checks owed: create/edit/delete an event and open each
  row's Details (time visible, only changed fields diffed, resulting state
  shown); check a legacy row and an old user-update row still render; access
  grant/update/revoke show the role transition.

## 1.74 Week v2 event chips + dark-mode tab indicator (Phase 3ae)

The Week v2 matrix's event banners looked off next to the Mantine-based
schedule views (sharp corners, flush against the cell edges), and in dark
mode the active-tab underline was nearly invisible.

- **Week v2 banners** (`src/app/(protected)/dashboard/WeekMatrixView.tsx`) —
  the single stretching `UnstyledButton` became the same two-layer structure
  the Mantine `ScheduleEvent` uses (and the Day view's all-day bars already
  mirror): the outer button keeps the grid placement/click and is now a
  transparent spacer with `padding: 2px` (a roomier version of the `.event`
  1px inset from the cell edge — bumped after the 1px looked too tight),
  and an inner `Box` is the visible chip — `borderRadius: 8` (radius `md`,
  doubled from the schedule views' 4px after the same feedback), the existing
  1px border/background/foreground from `variantColorResolver`
  (`variant: "light"` — already identical to the Mantine views), medium font
  weight (`.eventInner` is `--mantine-font-weight-medium`), the 1px 6px text
  padding (kept as-is — only the outer inset was doubled), and the same
  0.75rem ellipsized title. No hover state — the app is mobile-only and
  Mantine's event hover is `@media (hover: hover)`.
- **Dark-mode tab indicator** (`src/app/globals.css`) — the active tab's
  underline is a 2px border in `--tabs-color` (default
  `--mantine-primary-color-filled`), which in dark mode resolves to brand
  shade 8 (`#0a3a85`) — nearly invisible on the dark body (`#141414`). One
  rule re-declares the variable on the active tab itself
  (`[data-mantine-color-scheme="dark"] [role="tablist"] [role="tab"][data-active]
  { --tabs-color: var(--mantine-brand-color-4) }`): the variable is set inline
  on the Tabs root, so a declaration on the descendant tab wins over
  inheritance without `!important`, and the `data-mantine-color-scheme`
  attribute is set pre-paint by `ColorSchemeScript` (no flash). Fixes the
  dashboard view tabs, the settings sub-tabs, and the event form's
  time-option tabs at once; light mode (brand-6 underline) is untouched.
- Verification: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (449) all pass.
  Manual check: Week v2 in both color schemes (rounded, inset chips) and the
  tab underline in dark mode on /dashboard and /settings.

## 1.75 Tap-to-show tooltips for user shortnames (Phase 3af)

The user shortname labels in the Day/Week/Week v2 views showed the full name
in a `Tooltip` on hover only — unreachable on touch devices (no cursor), and a
tap did nothing.

- **Fix** (`src/app/(protected)/dashboard/DashboardView.tsx`) — the shared
  `renderResourceLabel` Tooltip now passes
  `events={{ hover: true, focus: false, touch: true }}`. Mantine 9.5.1's
  `Tooltip` maps
  `events.touch` to floating-ui `useHover` with `mouseOnly: false`, so a tap
  opens the tooltip the same way a mouse-enter does; the tooltip stays
  uncontrolled, so Mantine's `useDismiss` closes it on a tap outside or
  Escape. `events` replaces the whole default object (`{ hover: true,
  focus: false, touch: false }`), hence the explicit `hover: true` restates
  desktop behavior. One change covers all three row-based views (Day, Week,
  Week v2) since they share the renderer; the tooltip is portal-rendered, so
  the sticky label column's `overflow: hidden` can't clip it.
- Known edge case: starting a scroll gesture on a label can flash the tooltip
  (floating-ui treats touch movement as hover) — accepted.
- Verification: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (454) all pass.
  Manual check owed (touch device / DevTools touch emulation): tap a shortname
  in Day/Week/Week v2 → full name appears; tap elsewhere → dismissed; desktop
  hover unchanged.

## 1.76 Documentation deep-dives (Phase 3ag)

`docs/events-cache.md` had become the de-facto deep-dive format (numbered
headers, TOC, Mermaid, constant/helper tables, pure-helper & testing index,
file index). The other subsystems were documented only inline in `AGENTS.md`
bullets, which grew long and hard to navigate. This phase replicated the
deep-dive format across every other major subsystem, so each one has a
self-contained design reference.

**New documents** (all follow the `events-cache.md` conventions: `# 1. …` +
TOC, hierarchically numbered headers, Mermaid where it clarifies, pure
helpers & testing table, file index & related docs):

| Document | Covers |
| -------- | ------ |
| `docs/event-lifecycle.md` | Event form → Google Calendar data model: the 5-step wizard, guards, notes block codec (v1/v2/v3 brotli+base64url), `INTERNAL_EVENT_MARKER` / external detection, title templates & tokens, location policy, time options |
| `docs/event-mutations.md` | Create/update/delete: copy reconciliation, group-id identity, `findCopies`, legacy fallback, idempotent reconcile plans, rollback-of-only-new-copies, audit snapshots, cache invalidation |
| `docs/ui-state.md` | The `cloudy2.ui` cookie: codec + degrade, per-key server reads, `resolveLaunchTarget`, client write path, pinned tabs, the `?_fresh=` one-shot marker, sign-out clear |
| `docs/audit-log.md` | The audit subsystem: schema + indexes, retention, `logAction`, action taxonomy, `diffFields`, filters + keyset pagination, rotation-on-read, the three `formatAuditDetails` shapes, CSV export |
| `docs/google-integration.md` | The integration layer: service-account config resolution, real client vs stub, error mapping, every calendar/event/ACL method, `sendEmail` |
| `docs/roster-sharing.md` | Roster & sharing: flat org model (department = calendar, `users.department_id`), Google-only ACLs, the two reconcile paths (on read, on write), access-level actions |
| `docs/loading-transitions.md` | Loading appearance: skeleton-only rule, route skeletons, `useMinSkeletonHold`, `useContentEnter` reveal fade, one-shot URL params, in-page exceptions |

**Wiring:**

- `README.md §1.12` doc index now lists all 9 documents (progress.md +
  events-cache.md + the 7 new ones).
- `AGENTS.md`: the long bullets are **kept as-is** (they are the quick
  reference); each relevant bullet now ends with a one-line pointer to its
  deep-dive (google-integration, events-cache, ui-state, event-lifecycle +
  event-mutations, audit-log, loading-transitions, roster-sharing).

**Drift found while writing (documented, not fixed):**

1. The `/overview` page described in `AGENTS.md`, `progress.md`, and
   `eventsCache.ts` comments **does not exist** on any branch (dev/main) — the
   new docs are written against the current branch, which has no Overview
   page.
2. `AGENTS.md`/`README.md` say `db:seed` seeds "departments/users/memberships";
   the actual seed inserts `calendars` + `users`.
3. Stale comment at `src/db/schema.ts:157` — "fresh 30s" vs the actual
   `GCAL_CACHE_FRESH_MS` of 60s.
4. `EventForm`'s client-side title preview duplicates `renderEventTitle`'s
   token logic inline (drift risk between preview and the string actually
   written to Google) — called out in `event-lifecycle.md`.

**Verification:** docs-only change — `pnpm lint`, `pnpm typecheck`, and
`pnpm test` all pass (no code touched).

## 1.77 Desktop responsive layout (Phase 3ah)

The app now has a purpose-built desktop layout at Mantine's `lg` breakpoint
(992px / 62em); below `lg` the mobile layout is unchanged. User-approved
decisions: full pass in phases; Mantine `Table` at `lg`+ for the data-dense
settings lists (scoped exception to the card-list rule); left sidebar at `lg`+
(bottom nav collapses); shell-first execution order.

- **Scaffolding (Phase 0)** — `globals.css` gains one `@media (min-width: 62em)`
  block: `--app-floating-bottom-offset` (bottom-nav clearance → 16px),
  `--settings-fab-bottom` + `.settings-page-pad` padding (bottom-nav + tab-bar
  clearance → 16px), `.page-container` (centered, `max-width: 1200px` at lg),
  and `.card-grid` (1fr → `repeat(auto-fill, minmax(320px, 1fr))`).
  `FloatingToolbar`'s default `bottomOffset` is now the CSS variable;
  `BOTTOM_NAV_FLOATING_OFFSET` and `settingsTabBar.ts`
  (`SETTINGS_TAB_BAR_OFFSET`) were deleted. New `PageContainer` component
  (`src/components/PageContainer.tsx`).
- **Shell (Phase 1)** — `AppShellShell` renders
  `AppShell navbar={{ width: 240, breakpoint: "lg" }}` (the same `NAV_ITEMS`
  data as the mobile footer) and
  `footer={{ height: BOTTOM_NAV_HEIGHT_CSS, collapsed: isDesktop }}`; the root
  carries `.app-shell-root`.
- **Settings (Phase 2)** — `SettingsTabs` becomes a sticky top row at lg
  (fixed strip below); Users / Departments / Event Types / Audit Log render a
  Mantine `Table` at lg (cards `hiddenFrom="lg"`, table `visibleFrom="lg"`);
  the Audit Log filters move from the ⋮ menu to an inline bar at lg;
  UserForm / EventTypeForm / TemplatesForm / General SettingsForm pair fields
  into 2-column `Grid`s; the settings layout wraps `PageContainer` +
  `.settings-page-pad`; modals widen one size step (UserForm md→lg,
  EventTypeForm sm→md).
- **Dashboard (Phase 3)** — schedule label widths widen at lg (resource
  3rem→6rem, group 1.5rem→3.5rem — passed through each view's own
  `style`/`vars` because `@mantine/schedule` declares those vars on the view
  root element, so a parent class can't shadow them), Week slot width
  4rem→4.5rem×scale, Month `maxEventsPerDay` 3→4; the Week v2 matrix label
  columns widen 3rem/1.5rem → 5rem/2.5rem (`contentMinWidth`/`labelLeft` and
  the header spacers track via `MatrixRow`'s new `labelWidth` prop); the
  "New event" FAB is hidden at lg and replaced by a header `Button`
  (`visibleFrom="lg"`); sm→md modal step-up for the event form / detail /
  agenda-day / filter / date-picker modals (agenda max-height 56dvh→70dvh);
  the event form's Timestamp step pairs Start/End side by side at lg.
  `src/lib/motion/origin.ts` gains `modalContentWidth(viewport, sizePx)`
  (`smModalContentWidth` redefined on top of it — existing tests unchanged).
- **Parade State & Contacts (Phase 4)** — both pages wrap `PageContainer`;
  their card lists switch to `.card-grid` (auto-fill ≥320px columns at lg).
- **Polish (Phase 5)** — `LoginForm` card `maw={{ base: 380, lg: 440 }}`;
  `manifest.ts` `orientation: "any"` (was `"portrait"`).
- **Docs** — new `docs/desktop-responsive.md` (added to the README §1.12 doc
  index); `AGENTS.md`: the "strictly mobile-only" convention rewritten as the
  mobile-first / lg-desktop convention (with the `<Table>` at-`lg`-only
  exception), and the stale `/overview` architecture bullet removed (the page
  does not exist on any branch — drift #1 from §1.76), keeping only the
  still-true dashboard filter-quick-action content.

**Verification:** `pnpm lint`, `pnpm typecheck`, and `pnpm test` (454) all
pass. Manual width sweep owed: 390 / 768 / 1024 / 1440 / 1920, light + dark,
all four nav pages + six settings tabs + login.

## 1.78 Desktop layout review fixes (Phase 3ai)

Code review of the Phase 3ah diff (verdict: request changes) surfaced two real
bugs and several convention issues; all fixed:

- **Settings tab bar did not actually stick (bug)** — `SettingsTabs` put
  `position: sticky` on `Tabs.List`, whose containing block (the `Tabs` root)
  is only as tall as the bar itself, so it scrolled away with the page.
  Compounding it, `--app-shell-header-offset` was referenced by
  `SettingsTabs`/`DashboardView`/`WeekMatrixView` but **defined nowhere**, so
  the `top` offset was invalid at computed-value time (`top: auto`). Fix: the
  var is now defined as `56px` (the app header's height) on `.app-shell-root`
  inside the `lg` media block in `globals.css` — deliberately not defined below
  `lg`, so the dashboard's sticky bars keep their legacy non-stuck mobile
  behavior (the AppShell header is `position: fixed` on mobile too per the
  installed @mantine/core 9.5.1 CSS; moving the var outside the media query
  would make the dashboard bars stick on mobile as well, if ever wanted).
  `SettingsTabs` now wraps `<Tabs>` in a sticky `Box` that is a direct child of
  the settings layout root — the same documented pattern as the `DashboardView`
  view-tabs wrapper.
- **Stale AGENTS.md reference** — the FAB convention bullet still pointed at the
  deleted `settingsTabBar.ts`/`SETTINGS_TAB_BAR_OFFSET`; it now documents the
  actual pattern (`bottomOffset="var(--settings-fab-bottom)"`).
- **Skeletons now match the desktop content** — new shared
  `SettingsTableSkeleton` (`src/app/(protected)/settings/SettingsTableSkeleton.tsx`;
  Mantine `Table`-shaped skeleton, `columns` = relative column widths, `Paper`
  props spread). The four table pages' `loading.tsx` keep the card skeletons
  `hiddenFrom="lg"` and add the table skeleton `visibleFrom="lg"`; the
  `AuditLogView` in-place `listLoading` swap does the same at `lg`.
- **Stale `/overview` references cleaned up** — `eventsCache.ts` comment +
  `docs/events-cache.md` (problem statement, goals, mermaid node, perf-table
  row). Historical mentions in `progress.md`/`.opencode/plans` are logs and
  intentionally untouched.
- **Nits** — `prettier --write` across all diff-touched source files;
  `DepartmentTable`'s desktop `Table` gained `tabularNums` (matching
  UserTable/AuditLogView); `docs/desktop-responsive.md`: week-slot mobile
  default corrected to `calc(3.75rem * var(--mantine-scale))` (verified against
  the installed @mantine/schedule 9.5.1 CSS), `NAV_ITEMS` → the local `items`
  array, §1.3 var table + §1.5 sticky description updated to match the
  implementation; `origin.test.ts` pins `modalContentWidth(viewport, 440)`
  directly (440 cap on wide viewports, 90vw fallback on a narrow phone).
- **Manual-QA note (from the review)** — on a desktop browser,
  `useMediaQuery` resolves `isDesktop` post-hydration, so the bottom nav can
  flash for one frame before collapsing; standard hook behavior, part of the
  owed width sweep.

**Verification:** `pnpm lint`, `pnpm typecheck`, and `pnpm test` (456, +2
`modalContentWidth` cases) all pass. Still owed: the §1.77 manual width sweep
(390 / 768 / 1024 / 1440 / 1920, light + dark, all pages), now including a
check that the settings tab row stays pinned below the 56px header while long
tables scroll at ≥992px, and that mobile (below `lg`) renders identically to
before.

## 1.79 Desktop responsive bugfixes (Phase 3aj)

Six bugs from first real-device testing of the desktop layout; all six shared
two root causes plus two independent ones.

- **Sidebar covered the whole screen below the breakpoint** — Mantine's AppShell
  renders `AppShell.Navbar` as a **fixed full-width overlay below its
  breakpoint unless `collapsed: { mobile: true }` is set** (verified in
  `assign-navbar-variables.mjs`: below-breakpoint it sets
  `--app-shell-navbar-width: 100%` with no off-canvas transform). Fix:
  `navbar={{ width: 240, breakpoint: "lg", collapsed: { mobile: true } }}` —
  below `lg` the sidebar is fully hidden and the bottom nav is the only chrome.
- **Bottom nav never collapsed on wide screens** — `theme.breakpoints.lg` in
  Mantine v9 is the string `"75em"` (1200px), so every
  `` useMediaQuery(`(min-width: ${theme.breakpoints.lg}px)`) `` produced the
  **invalid query `(min-width: 75empx)`**, which never matches — `isDesktop`
  was always `false`, so the footer never collapsed, the settings tabs rendered
  their mobile bottom bar on desktop, and every schedule/modal width override
  was inert. Two-part fix: `src/lib/theme.ts` now pins `breakpoints.lg` to
  `"62em"` (992px — matching the CSS media block, `visibleFrom="lg"`, and the
  navbar breakpoint; Mantine's default is 75em/1200px), and all 12
  `useMediaQuery` call sites drop the appended `px` (an em string + `px` is
  invalid). This also fixed the reported "left menu blocks the settings
  navigation tabs": at the user's ~992–1200px width the full-width navbar
  overlay sat on top of the mobile-positioned tab bar.
- **"Element type is invalid … got: undefined" on every settings navigation**
  (confirmed in the dev log with the stack pointing at
  `SettingsTableSkeleton.tsx:18`) — `SettingsTableSkeleton` had no
  `"use client"`, so the server `loading.tsx` files RSC-serialized its output,
  and the compound client sub-component reference (`Table.Thead`) failed to
  reconstruct on the client during soft navigation. Fix: `"use client"` added to
  `SettingsTableSkeleton` (it is UI-only; the page tables are already client
  components and unaffected).
- **"Encountered a script tag while rendering React component"
  (`layout.tsx` → `ColorSchemeScript`)** — known React 19.2 false positive
  (cf. shadcn-ui/ui#10104, next-themes#387): Next 16.2+ re-renders `<head>` on
  the client during navigation and React warns about any `<script>` element in
  the tree; the script itself runs correctly server-side before paint, and the
  warning is dev-only. Fix: `AppProviders` filters that exact message from
  `console.error` in development.
- **"Boxes lost margin" (Contacts / Parade State)** — judged a visual symptom of
  the Bug-1 navbar overlay covering those pages (the `.card-grid` gap resolves
  correctly); to re-verify after reload.

**Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (456) pass. Owed:
reload the dev session, re-navigate settings (skeleton error should be gone,
console clean), and run the §1.77 width sweep — now expecting desktop layout to
appear at ≥992px (sidebar visible, bottom nav collapsed).


## 1.80 Event form wizard: review step, relocated "On behalf of", optional creator (Phase 3ak)

Three user-driven changes to `EventForm.tsx` plus one decision reversal.

- **Progress UI removed** � the tap-to-jump-back dots and the "N of M � label"
  caption are gone (`UnstyledButton`/`Box` imports and the `StepDef.label`
  field dropped with them). Back is now the only backward navigation.
- **"On behalf of" moved out of every step** � it was a sticky select pinned
  above all step content for admins; it is now its own step after Remarks
  (`buildSteps(isAdmin)` replaces the static `STEPS`: regular users walk six
  steps, admins seven). Its invitee-chip sync onChange moved verbatim.
- **Review step added** � a read-only last page folding in the "Calendar
  preview" Paper (removed from every other step) plus When / Location / Event
  Type / On-behalf-of / People / Departments / Remarks rows computed from the
  same effective state as the submit payload (`reviewPeople`,
  `reviewDepartments`, `creatorName`, `whenText`).
- **DECISION REVERSED � "On behalf of" is now OPTIONAL for admins** (was
  required since 1.x: client gate `{ requireCreator: isAdmin }`, server
  `validateEventForm(..., { requireCreator })`). A blank select uniformly
  means **the acting admin themselves**, on create *and* update (clearing an
  existing owner reassigns the event to the editor; legacy ownerless events
  are adopted on first edit). Implementation:
    - New pure `withSelfCreator(values, sessionUserId)` in
      `events/validate.ts` (blank/whitespace ? session user, then
      `withCreatorInvited`); applied in both actions right after
      `requireSession()` � so targets, notes `createdBy`, ownership, and audit
      snapshots all see the effective creator even when none was submitted.
    - The `requireCreator` option and its "Choose who this event is on behalf
      of" error were deleted from `validateEventForm`; the creator step has no
      leave-gate; the select lost `required` (placeholder "Yourself",
      description marks it optional); `STEP_BY_FIELD` keeps the defensive
      `creatorId ? creator` mapping.
    - Review falls back to the session user's display name, so it always shows
      the effective owner.
  Docs synced (`event-lifecycle.md` �1.3/�1.4/�1.4.1/�1.5.2/file tables,
  `event-mutations.md` diagram + table).

**Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (460, +4 net from
the removed requireCreator case and the new `withSelfCreator` cases) pass.
Owed: manual create/edit walkthroughs for both roles (admin blank vs picked
creator incl. edit-clearing reassignment; regular user unchanged flow), then
confirm on Neon that notes `createdBy` lands for blank-creator creates.

## 1.81 Collapsible sidebar rail (Phase 3al)

On wide screens the desktop sidebar now minimizes to an icon rail, and the
minimized state is remembered per device like the pinned tabs and last page.

- **Icon-only rail** — `AppShellShell.tsx` gains a bottom-pinned toggle button
  (`IconLayoutSidebarLeftCollapse`/`Expand`, `aria-label` switches) that shrinks
  the sidebar 240px → 64px: `AppShell`'s `navbar.width` is now state-driven
  (Mantine re-emits the `--app-shell-navbar-width`/`-offset` CSS vars every
  render, so the main area's padding follows), and the `NavLink`s swap for
  centered icon-only `RailNavButton`s (label on a right-side `Tooltip`,
  `aria-label`/`aria-current` kept). The 240↔64 resize animates: the navbar gets
  an inline `transitionProperty: "transform, top, height, width"` (Mantine
  animates transform/top/height by itself; the main area already transitions
  its padding). Below `lg` nothing changes (the navbar is hidden there by
  Mantine's `collapsed.mobile`).
- **Remembered per device** — a new `sidebarCollapsed` boolean in the
  `cloudy2.ui` cookie. `UiState` + `normalizeUiState` (only real booleans
  survive) + `mergeUiState` (patch-wins — it had to copy the key, the old merge
  silently dropped unknown top-level keys). The restore is **server-side**: the
  React 19 `react-hooks/set-state-in-effect` rule rejects the classic
  "hydrate-from-cookie-in-an-effect" pattern, so `(protected)/layout.tsx`
  decodes the cookie with `decodeUiState` before first paint and passes
  `sidebarCollapsed` to `AppShellShell` as its initial state (the server
  renders exactly what was remembered — no flash, no hydration mismatch); the
  shell's effect persists the value on mount and every toggle (writing `false`
  too, so the cookie converges when the sidebar is re-expanded). Sign-out
  (`clearUiState`) wipes it with the rest.
- Docs synced (`desktop-responsive.md` §1.2 + diagram + file table,
  `ui-state.md` shape/normalize/merge/writers/index + line refs, `AGENTS.md`
  shell + cookie bullets).

**Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (464, +4 for the
new `sidebarCollapsed` normalize/merge cases), and `pnpm build` all pass.
Owed: wide-window manual check — toggle the rail (animated resize, tooltips,
active states), reload/PWA relaunch to confirm the remembered state, and a
<992px pass to confirm the mobile layout is untouched.

## 1.82 Settings list pages: full-size desktop create buttons (Phase 3am)

At `lg+` the Settings > Users / Departments / Event Types pages create entries
from the FAB, which is a poor fit for a data-table context. They now use the
same full-size button pattern as the Calendar page's "New event" button.

- **Users** (`UserTable.tsx`) — an "Add user" `Button` (`visibleFrom="lg"`,
  `leftSection={<IconPlus size={16}/>}`, `--button-height: 43px` to align with
  the 43px `FilterButton`) sits in the existing search toolbar, right of the
  filter icon.
- **Departments / Event Types** — each gains a bordered toolbar `Paper`
  (right-aligned 43px "Add department" / "Add event type" button) above the
  list, rendered **before** the empty-state conditional so the button is
  available even when the list is empty.
- The three `FloatingToolbar`s are wrapped in `<Box hiddenFrom="lg">` so the
  FABs remain mobile-only (mirrors the dashboard FAB's pattern).
- Skeletons kept in sync: a `visibleFrom="lg"` button placeholder in
  `users/loading.tsx`'s toolbar group, and a desktop toolbar-row skeleton in
  the departments/event-types `loading.tsx` files.

**Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (464) pass.

## 1.83 Mobile FAB: portaled Affix + :root offset vars (bugfix)

On small screens the FABs (settings pages, dashboard, contacts, audit log)
were not pinned to the bottom of the screen — they sat below the last item in
the list.

- **Root cause** — the FAB is a Mantine `Affix` (`position: fixed`). Commit
  `9fa5889` had switched `FloatingToolbar` from Mantine's default (portaled to
  `<body>`) to inline rendering (`withinPortal={false}`) because the page-
  scoped offset vars (`--settings-fab-bottom` on `.settings-page-pad`) don't
  resolve for a body-portaled element — with the portal version `bottom` was
  unresolved and the FAB stuck to the top of the screen. The inline version
  resolves the vars, but an inline `position: fixed` depends on the page's
  DOM context and on-device it positioned relative to the content instead of
  the viewport (the `<Box hiddenFrom="lg">` wrapper from §1.82 was verified
  innocent — it's a `display: none` media rule only).
- **Fix** — both problems at once: `FloatingToolbar.tsx` drops
  `withinPortal={false}` (the Affix portals to `<body>` again, so its
  containing block is always the viewport regardless of page layout), and the
  two offset vars move to `:root` in `globals.css`
  (`--app-floating-bottom-offset`, `--settings-fab-bottom`, with the existing
  `16px` values re-declared on `:root` inside `@media (min-width: 62em)`), so
  they resolve from the portaled element. `.settings-page-pad` keeps only its
  `padding-bottom: var(--settings-fab-bottom)` (lg override `padding-bottom: 0`
  unchanged); `.app-shell-root` keeps only the lg
  `--app-shell-header-offset: 56px` (sticky bars).
- Verified with headless Chrome at a mobile-class viewport: FAB pinned at
  `bottom: 124px` (the `--settings-fab-bottom` value with a zero safe-area
  inset; scroll-invariant rect) above the settings tab bar, independent of
  list length.

**Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (464) pass.
Owed: on-device recheck — FAB pinned bottom-right above the settings tab bar
and the bottom nav on dashboard/contacts, stays put while scrolling. If the
phone runs the installed PWA, the Serwist service worker may serve the old
bundle until it updates (hard-reload once after deploy).

## 1.84 Full Day / Half Day time-option split (Phase 3an)

The per-event-type "Full Day" option previously bundled plain all-day dates
with optional (AM)/(PM) half-day markers. The two concerns are now separate
options; no DB migration (`event_types.time_options` is a text JSON list of
strings — `"half"` is just a new value).

```mermaid
flowchart LR
  A["Event type<br/>time_options"] --> B["range<br/>Start &amp; End"]
  A --> C["full<br/>Full Day"]
  A --> D["half<br/>Half Day"]
  B --> B1["2 datetime pickers"]
  C --> C1["2 date pickers<br/>(no markers)"]
  D --> D1["2 date pickers +<br/>AM/PM per side"]
  D1 --> E{"start = end<br/>indicator?"}
  E -- yes --> F["title gets (AM)/(PM)"]
  E -- mixed --> G["no title marker"]
```

- `timeOptions.ts` — `TIME_OPTIONS` gains `"half"` ("Half Day"); `full`'s
  description drops the AM/PM wording. Legacy note kept in the module doc:
  pre-split events carry `"full"` + markers in their notes and keep working.
- AM/PM re-gated from `"full"` to `"half"` everywhere it had feature meaning:
  `resolveEventTime` (defaults/blanks indicators), the notes write in
  `buildGcalEventInput`, `renderEventTitle`'s suffix, and
  `validateEventForm`'s required checks + `sortKey` folding. All-day-on-Google
  stays `timeOption !== "range"` for both day-based options.
- `formatEventAuditTime` renders markers **by presence** for any non-`range`
  option — so legacy `full` snapshots (before-state read from notes) still
  show `(AM–PM)` spans while new `full` events render bare dates.
- `EventForm.tsx` — tabs pick up Half Day via `allowedOptions`;
  `timeFields` shows the AM/PM controls only under `half`; submit payload and
  live preview gate on `half`; edit prefill still reads stored markers so a
  legacy event switched to Half Day keeps its original AM/PM. Review-step
  "When" now mirrors the audit rendering (markers by presence) **and fixes an
  off-by-one**: it double-subtracted a day from the inclusive form end date
  (picking Aug 21–23 displayed "Aug 21 – Aug 22").
- Admin UI needs no code change — `EventTypeForm`/`EventTypeTable` iterate
  `TIME_OPTIONS`, so the third checkbox/badge appears automatically. Existing
  type rows stay valid; admins opt types into Half Day by editing them.
- Tests updated/extended: `timeOptions.test.ts` (option set, labels,
  resolution), `validate.test.ts` (required-indicator gating moves to `half`),
  `notes.test.ts` (`"half"` now parses as a valid option),
  `eventAudit.test.ts` (legacy-full vs new-half marker rendering;
  `renderEventTitle` full+markers → no suffix), `format.test.ts` ("Half Day"
  audit labels).

**Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (469, +5 net)
pass; schema untouched so no `db:generate` drift.
Owed: manual pass over the wizard with each option mix (tabs order, review
"When" text, preview suffix) and one legacy full+marker event edit.

## 1.85 Parade State attendance-taking mode (Phase 3ao)

The Parade State page gains **attendance mode** via an entry point that
follows the app's responsive convention: a bottom-right FAB below `lg`, and a
nav-row "Attendance" button beside the kebab menu at `lg`+ (same pattern as
the dashboard's "New event"). Entering it puts a checkbox beside every user
card (the checkbox *or* the card itself toggles), switches the department
headers from *in-camp/total* to *checked/total*, and turns the entry point
into a Mantine `Menu` with **Reset** (clears every date), **Copy to
Clipboard** (roster text), and **Exit** (mode off, checks kept). Checked state
lives only in `localStorage` (`cloudy2.parade-attendance` — the app's first
`localStorage` use), keyed by the shown date so each day keeps its own
roster; the mode itself does not survive a reload.

```mermaid
flowchart LR
  A["FAB &lt;lg / Button lg+<br/>(normal mode)"] -- tap --> B["Attendance mode<br/>record loaded into memory"]
  B -- "tap checkbox / card" --> C["toggle user<br/>write localStorage under shown date"]
  B -- tap entry point --> D["Menu (top-end / bottom-end)"]
  D -- Reset --> E["clear all dates"]
  D -- Copy --> F["clipboard string:<br/>&lt;dept&gt; (X of Y)<br/>Name - Absent / - (ACRONYM, …)"]
  D -- Exit --> G["Normal mode<br/>(checks kept)"]
  C --> H["localStorage<br/>cloudy2.parade-attendance<br/>{ date: userId[] }"]
  E --> H
```

- `attendanceReport.ts` (new, pure) — `buildAttendanceReport(departments,
  checkedIds)`: departments in page order (A→Z, Unassigned last), empty ones
  skipped; header `<name> (<checked> of <total>)`; one line per user in
  roster order using the raw roster `name` (full name, not the display-name
  template): unchecked users get ` - Absent` (even when event-tagged — absent
  wins), checked users render bare or with ` - (<tags joined ", ">)` for
  event-tagged days; departments separated by a blank line, no trailing
  newline. Tags resolve via `resolveEventTypeTag`, the `{type:acronym}`
  fallback chain: registry shortname → raw type name → event title when the
  event has no type.
- `attendanceStorage.ts` (new) — pure codecs (`parseAttendanceRecord` returns
  `{}` for corrupt/non-conforming JSON and keeps only `string[]` values;
  `serializeAttendanceRecord` drops empty dates) plus SSR-safe
  `loadAttendanceRecord` / `saveAttendanceIds` / `clearAttendance`
  (try/catch no-ops outside a browser; node-env tests cover the codecs only).
- `page.tsx` — fetches `listEventTypes()` alongside the other loads and
  passes `eventTypeAcronyms` (`Record<type name, shortname>`) to the view.
- `ParadeStateView.tsx` — `attendanceMode` + `attendance` (in-memory
  `Record<date, userId[]>`, read once on mode entry; `checkedIds` derived per
  shown date, so day switches swap rosters with no effect — an earlier
  effect-based load tripped `react-hooks/set-state-in-effect`); toggles
  persist immediately under the shown date; checked cards get a green tint
  that outranks the amber out-of-camp tint. The entry point is one shared
  button element: bare normally, wrapped as the `Menu.Target` in attendance
  mode (`bottom-end` at `lg`+, `top-end` on the mobile FAB), with the three
  items defined once and reused. The mobile FAB is gated with
  `useMediaQuery` instead of a CSS wrapper because the `FloatingToolbar`
  Affix portals to `<body>` (`withinPortal: true` default), so a
  `hiddenFrom` wrapper cannot hide it — which also means the dashboard's
  `<Box hiddenFrom="lg">` around its own mobile-only "New event" FAB is
  likely ineffective today (flagged, not fixed here). Copy uses
  `useClipboard` with a green/red `notifications.show`, menu auto-closes on
  item click.
- Tests: `attendanceReport.test.ts` (12), `attendanceStorage.test.ts` (8).

**Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (489) pass;
schema untouched so no `db:generate` drift.
Owed: manual pass — enter/exit from both entry points, card + checkbox
toggling, per-date isolation on day switches, reload restoring checks (mode
off), copied string format (Absent/acronyms/fallback chain), Reset clearing
all dates, filters preserving hidden users' checks.

## 1.86 Calendar skeleton consistency pass (bugfix)

Review of the calendar page's loading skeletons against
[docs/loading-transitions.md](docs/loading-transitions.md) found three shape
mismatches, all fixed:

- **Week v2 showed the Week view's skeleton.** The in-page grid-swap ternary in
  `DashboardView.tsx` branched on `isWeek` (week *or* weekv2), so Week v2 loads
  painted `WeekGridSkeleton` (weekday row + uniform 7-column lanes). A new
  `WeekMatrixSkeleton` (`calendarSkeleton.tsx`) now matches `WeekMatrixView`'s
  matrix: two-line-per-day header band inside the bordered paper, resource rows
  of label placeholder + 7-column day grid with deterministic multi-day
  spanning banner bars (36px lanes, mirroring `ROW_HEIGHT_PX`). The ternary
  branches `isWeekV2` before `isWeek`.
- **Double weekday header during Week loads.** `WeekGridSkeleton` embedded a
  fake weekday row while the real pinned `WeekDayLabelStrip` stays visible
  above the grid through loads — two stacked headers. The skeleton row is gone;
  `WeekdayRow` remains inside `MonthGridSkeleton` only (the real MonthView
  renders weekdays even with `withHeader={false}`).
- **Route fallback always month-shaped.** `dashboard/loading.tsx` unconditionally
  painted `MonthGridSkeleton`, so a cold start onto a remembered Agenda/Week/
  Day view hard-swapped layouts when content landed. It is now an async server
  component that reads the `cloudy2.ui` cookie and picks the matching per-view
  skeleton; month rows use the remembered month when it passes validation.

```mermaid
flowchart LR
  C["cloudy2.ui cookie"] --> D["decodeUiState"]
  D --> R["resolveDashboardView(ui.view)"]
  R --> S{view}
  S -- month --> M["MonthGridSkeleton<br/>(remembered-month row count)"]
  S -- weekv2 --> W2["WeekMatrixSkeleton"]
  S -- week --> W["WeekGridSkeleton"]
  S -- agenda --> A["AgendaListSkeleton"]
  S -- schedule/Day --> SD["ScheduleGridSkeleton"]
```

- `resolveDashboardView(raw)` (new, pure, in `uiState.ts`): known
  `DASHBOARD_VIEW_VALUES` pass through, everything else degrades to `"month"`.
  `page.tsx` uses it too, replacing its inline switch — and it now also
  validates the cookie's remembered view, which previously flowed into
  `DashboardView` unvalidated. Shared by page + route fallback so both resolve
  the same shape per request.
- Loading files receive **no URL props** (Next instantiates them as
  `createElement(Loading, { key: 'l' })`), so the fallback is cookie-only:
  an explicit `?view=` link or an `edit` deep link can briefly disagree with a
  divergent remembered view before the real render replaces it. F5/PWA relaunch
  match exactly (`navigate()` keeps `?view=` synced with the persisted cookie).
- Route fallback nav-row placeholders: circles → rounded squares (`radius="md"`)
  matching the real `ActionIcon variant="default"` (0.5rem default radius), plus
  a desktop-only "New event" button placeholder (`visibleFrom="lg"`). Other
  pages' loading files keep their circle pattern deliberately (scope: calendar).
- `docs/loading-transitions.md` §1.4/§1.10/§1.11 updated for the new skeletons +
  shared resolver, and all stale `DashboardView.tsx`/`page.tsx`/
  `ParadeStateView.tsx`/`AuditLogView.tsx` line references refreshed.

Tests: `resolveDashboardView` covered in `uiState.test.ts` (pass-through of all
five values; unknown/empty/non-string → month).

**Runtime bug caught by verification:** importing `monthGridRows` through
`calendarSkeleton.tsx`'s re-export made the loading fallback call a
*"use client"* reference during server render —
`Error: Attempted to call monthGridRows() from the server…`. Rendering client
*components* from a server fallback is fine; calling their exported functions
is not. Fixed by importing from `@/lib/events/datetime` directly. Neither
typecheck nor unit tests can see client-reference proxies — only an actual SSR
render exercises this path.

**Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (491) pass; schema
untouched so no `db:generate` drift. Live dev-server pass (scripted NextAuth
login + streamed first-response inspection against the hot-reloading dev
instance):

- all five views SSR-render final content with view-distinct markers and the
  tabs bar — no error pages;
- with forged `cloudy2.ui` cookies, each cold `/dashboard` request streams the
  matching fallback shape: month → grid skeleton (42 × 124px cells), week →
  label-lane skeleton with **no** fake weekday row (double-header fixed),
  weekv2 → matrix skeleton (two-line header bars, 36px lanes, six banner
  chips at radius 0.5rem), schedule/Day → 72% event-bar rows, agenda → list
  rows;
- nav-row placeholders render rounded-square (`--mantine-radius-md`, four of
  them incl. the desktop-only button).

## 1.87 Event webhooks to external systems (Phase 3ap)

Successful in-app event create/update/delete now POST a JSON notification to a single
admin-configured webhook URL so external systems can mirror the change.

```mermaid
sequenceDiagram
    participant A as server action
    participant W as dispatchEventWebhook
    participant S as settings row
    participant R as receiver
    A->>A: Google writes + audit row succeed
    A->>W: input (snapshot, eventId, changes, actor…)
    W->>S: getSettings()
    alt disabled or no URL
        W-->>A: no-op
    else configured
        W->>W: buildEventWebhookPayload + webhookSignature (pure)
        Note over W: after(() => …) — the action returns now
        W->>R: POST application/json (10s timeout)
        R-->>W: response/errors console-logged only
    end
```

- **Config** (General tab card): `settings.webhook_url` (empty = off),
  `webhook_secret`, `webhook_enabled` master switch; migration
  `drizzle/0014_ancient_ogun.sql`. `updateWebhook` follows the other settings
  actions (requireAdmin → pure `validateWebhookForm`/normalizers → diff audit
  row of enabled flag + URL, never the secret).
- **Payload** (`src/lib/webhooks/payload.ts`, pure): built from the same
  `EventAuditSnapshot` the audit log stores — rendered title, raw description,
  type, pre-formatted UTC+8 `time` plus structured `timeOption/start/end/
  startAmPm/endAmPm` when the parts are known, outOfCamp/location,
  departments/invitees/creator by display name — plus `action`
  (`event.created|updated|deleted`), logical group `eventId`,
  `googleEventIds[]`, `occurredAt`, and `actor {name, role}`. Updates add
  `changes` `[before, after]` pairs (the audit `diffFields`). Delete of a
  legacy event omits the structured time keys; `time` remains the fallback.
- **Delivery** (`src/lib/webhooks/deliver.ts`): fire-and-forget via `after()`;
  10s `AbortSignal.timeout`; failures logged, never thrown; disabled or
  unconfigured endpoint is a no-op. Signed with HMAC-SHA256 over
  `"timestamp.body"` → `X-Cloudy2-Signature: sha256=<hex>`, with
  `X-Cloudy2-Timestamp` (replay binding) and `X-Cloudy2-Event` headers.
- **Wiring** (`events/actions.ts`): one dispatch per action immediately after
  each `logAction`, so rolled-back mutations never notify. `updateEvent` now
  also collects every touched Google event id in its reconcile loop
  (`touchedGoogleEventIds`) for the payload.
- Docs: new `docs/webhooks.md`; AGENTS.md architecture bullet; README §1.12
  index row.

Tests: `webhooks/payload.test.ts` (create shape incl. structured times;
update-only `changes`; legacy-delete omits structured keys; blank AM/PM →
null; array copies), `webhooks/sign.test.ts` (HMAC matches node crypto,
timestamp/body/secret binding), `settings/validate.test.ts` additions for the
URL/secret normalizers + form validation.

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass;
`pnpm db:generate` clean after committing the migration.

## 1.88 Multiple webhook endpoints + in-app payload guide (Phase 3aq)

The Phase 3ap single-endpoint webhook became a full CRUD registry of endpoints, each
delivered independently.

- **Schema**: new `webhooks` table (id/name/url/secret/enabled + timestamps);
  `drizzle/0015_chubby_sentinel.sql` seeds it from the old
  `settings.webhook_url/secret/enabled` row before dropping those columns. No
  per-endpoint action filters — every enabled endpoint receives all three actions.
  Duplicate URLs are permitted (same consumer, different secrets).
- **CRUD** (`src/lib/webhooks/actions.ts`): `createWebhook` / `updateWebhook` /
  `deleteWebhook`, requireAdmin → pure `validateWebhookForm` (required name ≤100,
  http(s) URL ≤500, secret ≤200) → DB write → audit rows `webhook.create/update/
  delete` with flat name/url/enabled details (never the secret). Validators moved out
  of `settings/validate.ts`; the General tab card was removed.
- **Delivery** (`deliver.ts`): one query for enabled endpoints; payload/body/timestamp
  built once; a single `after()` fans out via `Promise.allSettled`, signing each POST
  with its endpoint's secret (HMAC-SHA256 over `"timestamp.body"`). Failures log as
  `[webhook:<name>]`. Dispatch call sites in `events/actions.ts` unchanged.
- **UI**: new Settings tab "Webhooks" (`/settings/webhooks`) cloned from event-types:
  mobile card list / desktop table, FAB or desktop Add button, add/edit modal form
  (name, URL, password-masked secret prefilled, Enabled switch), delete confirm.
- **In-app integration guide** (`PayloadReference.tsx`, accordion under the list):
  actions & headers tables, example payloads for all three actions generated at
  render time by pure `buildExampleWebhookPayload` from the REAL payload builder with
  fixture data (can never drift), and a copyable HMAC verification snippet.
- Docs: `docs/webhooks.md` restructured (§1.2 config table, §1.4 fan-out sequence
  diagram, new §1.6 in-app guide); AGENTS.md bullets updated.

Tests: `webhooks/validate.test.ts` (moved + name cases), `webhooks/example.test.ts`
(determinism, distinct per action, update-only changes, legacy-delete shape).
Verification: lint/typecheck/test pass; `db:generate` clean after committing the
hand-seeded migration; local `pnpm db:migrate` applied.

## 1.89 Attendance report: present wins, no event tags (Phase 3ar)

The attendance-mode "Copy to Clipboard" report previously suffixed a checked user
with their out-of-camp event tags (`Name - (SITE, NSC)`, acronyms via the
`{type:acronym}` chain). Checking is now the override: a checked user renders bare
(`Name`) — present, no event tags, no `Absent` — whatever their calendar says.
Unchecked users stay `Name - Absent`; department headers keep their
`(checked of total)` count.

```mermaid
flowchart LR
  U["user on the day"] --> C{"checkbox on?"}
  C -- "yes — overrides calendar" --> P["Name"]
  C -- "no" --> AB["Name - Absent"]
```

- `attendanceReport.ts` — `buildAttendanceReport` renders checked users bare;
  `eventTags` dropped from `AttendanceReportUser`; `resolveEventTypeTag` deleted
  (the tag fallback chain had no other consumer).
- `ParadeStateView.tsx` — `copyAttendanceReport` maps users to `{id, name}` only;
  `eventTypeAcronyms` prop removed.
- `page.tsx` — `listEventTypes()` query removed (one fewer DB round-trip per
  render).
- **Unchanged**: event badges (time + title) on the user cards, headcount
  display, localStorage attendance storage.

Tests: `attendanceReport.test.ts` (7, incl. a checked-bare case; the
`resolveEventTypeTag` block removed with the function).
Verification: lint/typecheck/test pass (522 tests).

## 1.90 Branded error, 404 & offline fallbacks

The app had zero `error.tsx` / `global-error.tsx` / `not-found.tsx` files: any RSC or
route exception surfaced Next's unstyled production crash screen, unknown URLs got the
stock 404, and (with the service worker's deliberate `NetworkOnly` strategy) an offline
navigation was a raw browser error. All three now render branded fallbacks:

```mermaid
stateDiagram-v2
  [*] --> Offline: browser reports offline
  Offline --> Online: connection returns
  note right of Offline
    OfflineBanner (amber strip,
    AppProviders, all routes)
  end note
```

- **`ErrorState`** (`src/components/ErrorState.tsx`): shared centered fallback —
  brand-light storm-cloud icon, title, dimmed copy, optional "Try again" button wired
  to the boundary's `reset()` or a custom action slot.
- **Boundaries**: `(protected)/error.tsx` (renders inside the shell, so sidebar/bottom
  nav stay alive), `login/error.tsx`, and `global-error.tsx` (own `<html>` document +
  re-mounted `MantineProvider`, same theme). Each logs via `console.error`.
- **`not-found.tsx`** at the app root with a "Go to Calendar" link.
- **`OfflineBanner`** (`src/components/OfflineBanner.tsx`): fixed amber strip pinned to
  the viewport top whenever `navigator.onLine` is false; flips in an effect (no
  hydration mismatch) and auto-hides on reconnect. Mounted once in `AppProviders`.

Verification: lint/typecheck/test pass.

## 1.91 Mobile correctness: safe areas, toast placement, skeleton fidelity

- **Safe-area work was inert**: every `env(safe-area-inset-bottom)` expression
  evaluated to 0 without `viewportFit: "cover"` in the root `Viewport` export. Added it;
  the AppShell header height is now `calc(56px + env(safe-area-inset-top))` so a
  standalone PWA extends edge-to-edge behind the status bar instead of letterboxing;
  the offline banner clears the inset too.
- **Toast/FAB collision**: Mantine's default bottom-right notification stack landed
  exactly on the FloatingToolbar corner on mobile. `<Notifications>` now positions by
  breakpoint — top-center below lg (where FABs live), bottom-right at lg+ (no FABs).
  Shared `DESKTOP_MEDIA_QUERY` exported from `theme.ts`; both `useMediaQuery` call
  sites (`AppProviders`, `AppShellShell`) consume it.
- **Desktop layout shift on load**: contacts + parade-state `loading.tsx` painted their
  skeletons full-bleed while the pages wrap in `PageContainer` (1200px cap); both now
  wrapped, no >1200px snap when content commits.
- **Skeleton fidelity**: parade-state nav placeholders switched from circles to the
  real 43×43 radius-md ActionIcon shape; audit-log search skeleton lost its stray
  `radius="sm"`; general/templates/contacts control skeletons bumped 36px → the real
  ~43px input/button heights.

Verification: lint/typecheck/test pass.

## 1.92 Interaction consistency: confirms, chips, export scope, login errors

- **Attendance Reset now confirms** ("Clear attendance checks for every date? This
  cannot be undone.") — previously it wiped ALL dates' localStorage checks from the ⋮
  menu with zero friction, unlike every other destructive action in the app.
- **Audit purge** gained a `loading` prop + re-entry guard on its confirm Delete (was
  the only destructive action without either). **CSV export** switched from
  `window.location.href` navigation to fetch→blob→anchor download: real progress on the
  button, failures toast instead of navigating away, filename still parsed from
  `Content-Disposition`.
- **Dismissible applied-filter chips**: Users-tab status/department chips are now
  Mantine `Pill`s with per-chip remove buttons (Badge has no `onRemove` in v9);
  parade-state renders its applied Calendars/Users filters as removable pills too
  (previously count-badge only).
- **Contacts VCF export respects the active search filter** — "what you see is what you
  get"; confirm modal counts the filtered set and says so when a search is active.
- **Login errors** render in the PasswordInput's own error slot (wired via
  `aria-describedby`) instead of a detached red Text, plus a format hint under the
  field: admin password, or 8-digit phone + keyword.
- **DateSelectorModal month chevrons** up from ~26px subtle/sm targets to the app-wide
  43px convention with size-18 icons.

Verification: lint/typecheck/test pass.

## 1.93 Accessibility pass: keyboard reachability, pressed states, parade legend

- **`activatable()` helper** (`src/lib/ui/activatable.ts`, unit-tested): spreads
  `role="button"` / `tabIndex={0}` / Enter-Space handler onto non-semantic click
  targets, ignoring keys that originate on inner interactive children. Applied to the
  Users/Event-types/Webhooks click-to-edit cards AND desktop table rows (keyboard users
  could not open those modals at all before) and parade attendance cards.
- **Role/Department pickers in UserForm** are real toggle buttons now (`aria-pressed`,
  keyboard-operable) wrapping the unchanged Badge visuals.
- **Parade state status no longer color-only**: out-of-camp cards carry an IconMapPin
  twin (attendance-mode checked cards an IconCheck), a text legend names both colors,
  and attendance mode shows a day-level `X/Y present` total beside the legend.
- **Search inputs labeled**: contacts, users, and both audit search boxes gained
  `aria-label`s (previously placeholder-only). The audit mobile filter trigger's glyph
  changed from the kebab (used for overflow actions elsewhere) to IconFilter, matching
  its "Filter log" label.

Note: Mantine's `UnstyledButton` already ships a visible `:focus-visible` ring
(`mantine-focus-auto` class verified in compiled styles.css), so custom nav buttons
needed no extra styling.

Tests: new `src/lib/ui/activatable.test.ts` (7 cases).
Verification: lint/typecheck/test pass (529 tests).

## 1.94 Not-found prerender fix (bugfix)

Vercel's build failed on `/_not-found`: `not-found.tsx` was a Server Component whose
action element passed `component={Link}` — a function reference — into the client
`ErrorState`. Functions cannot cross the server→client serialization boundary during
prerender (React error "Functions cannot be passed directly to Client Components").
Local gates missed it because lint/typecheck/vitest never exercise static generation;
only `next build` does.

Fix: mark `src/app/not-found.tsx` `"use client"` (it exports no metadata and needs no
server data), keeping the `<Button component={Link}>` SPA link intact.

Verification: full `pnpm build` passes — all 18 routes generate, `/_not-found`
prerendered static.

## 1.95 Department event colors (Phase 3as)

Admins can now set the color of each department's events from Settings →
Departments. Previously the color was derived purely from hashing the calendar
UUID onto a fixed 10-color Mantine palette (`colorForCalendar` inline in
`queries.ts`) — nothing was stored, Google's `colorId` was ignored in both
directions, and there was no way to configure it.

- **Schema**: `calendars.color` nullable text (migration `0016`): `null` =
  "Auto" (the deterministic per-calendar hash default, unchanged behavior); a
  value = an admin-pinned Mantine palette name.
- **Pure helpers** `src/lib/events/calendarColors.ts` (unit-tested):
  `CALENDAR_COLORS` (the fixed 10-color palette), `isCalendarColor`,
  `normalizeCalendarColor` (accept palette name, fall back to null — the
  accept/fallback pattern of `normalizeLocationPolicy`), `colorForCalendar`
  (moved from `queries.ts`, now exported), `effectiveCalendarColor` (pinned or
  default).
- **Read path**: `mapCalendarItem` stamps
  `effectiveCalendarColor(calendar.id, calendar.color)`; `fetchRangeEvents`
  already selected full calendar rows. The color is applied in the mapping pass,
  so it never enters `google_event_cache` — **no invalidation needed**; a color
  change takes effect on the next render.
- **Writes**: `createDepartment` stores the normalized color (audit details now
  include it); `renameDepartment` — the one save behind the form — calls
  Google's rename **only when the name actually changed** (color is app-local)
  and writes name + color in a single DB update. New audit action
  `calendar.update` (`Calendar updated`) with `diffFields({ name, color })`; a
  `Color` field label was added in `audit/format.ts`; legacy `calendar.rename`
  rows are untouched.
- **UI** (`settings/departments/`): new `DepartmentColor.tsx` — `ColorDot` list
  chip, `DepartmentColorPicker` (tap-friendly swatch buttons, `aria-pressed`,
  "Auto" rendered as a conic gradient of the palette — no keyboard pop-up per
  the no-input convention), `formatCalendarColorLabel` ("Auto (blue)" when
  unset). The Add/Edit modal gained an Event color section (title now
  "Edit department"), and the list shows each department's chip + label; the
  Rename button became Edit.
- **Consumers unchanged**: `@mantine/schedule` and `WeekMatrixView` resolve
  whatever Mantine color arrives, so no view code moved.

Tests: new `calendarColors.test.ts` (8 cases).
Verification: lint/typecheck/test pass (537 tests); `pnpm db:generate` no-op
(drift-clean); full `pnpm build` passes (18 routes).

## 1.96 Event-type event colors (Phase 3at)

Event colors are now configured at the **event type** level instead of the
department level. Typed events render in the color of their type (one color per
type, shared across all departments); untyped/external events (created directly
in Google Calendar) fall back to the department calendar's color.

- **Schema**: `event_types.color` nullable text (migration `0017`) — same
  semantics as the old `calendars.color`: `null` = "Auto" (deterministic
  default), value = admin-pinned Mantine palette name. `calendars.color` is
  **kept**, now documented as the fallback for untyped/external events. No data
  migration — department colors keep working as the external fallback, and
  type colors start unset.
- **Pure helpers**: `calendarColors.ts` renamed to `eventColors.ts`
  (unit-tested): `EVENT_COLORS`/`isEventColor`/`normalizeEventColor` (renamed),
  `colorForCalendar` → `colorForId` (generic id hash — type name or calendar
  id), new `effectiveEventTypeColor(typeName, color)` (pinned or name-derived
  default), `effectiveCalendarColor` kept for the external branch, new
  `formatColorLabel(color, autoRefId)` (human-readable "Blue" / "Auto (Teal)"
  for settings lists and audit details).
- **Read path**: `fetchRangeEvents` additionally selects every event type's
  (name, color) — a tiny per-request read, so a color change needs no cache
  invalidation — and `mapCalendarItem` resolves typed events through
  `effectiveEventTypeColor` (events of a deleted type keep a stable
  name-derived color) and untyped/external ones through
  `effectiveCalendarColor`. Dashboard, parade state, and all views inherit it
  unchanged.
- **Writes**: `createEventType`/`renameEventType` persist the normalized
  color; audit details store the `formatColorLabel` label (create: absolute,
  rename: before/after diff).
- **UI**: new shared `src/components/ColorSwatchPicker.tsx` (`ColorSwatchPicker`
  + `ColorDot`; "Auto" swatch labeled with the id-derived default) replaces
  `DepartmentColor.tsx`. Settings → Event Types gains the Event color section
  in the form (Auto ref = the type name) and a Color column/dot in the list.
  Settings → Departments keeps its picker, relabeled "External event color"
  (form) / "External color" (list column) — typed events use the type's color.

Tests: `eventColors.test.ts` (renamed + extended, 13 cases).
Verification: lint/typecheck/test pass (542 tests); `pnpm db:generate`
drift-clean after committing `0017`; applied against Neon via `pnpm db:migrate`.

## 1.97 Sticky dashboard chrome & pinned view headers (Phase 3au)

On small screens every calendar view's headers scrolled out of view while the
grid scrolled vertically — only Week v2's day header felt pinned (its
horizontal-pan tracking), and even its vertical stickiness silently disengaged
below `lg`. Root cause: `--app-shell-header-offset` was declared **only inside
`@media (min-width: 62em)`**, so every sticky bar's `top` computed to `auto`
below the breakpoint.

- **Un-gated the var**: `.app-shell-root { --app-shell-header-offset: 56px }`
  now lives outside the media query in `globals.css` (the AppShell header is
  fixed at the viewport top at every width). Consumers wanting desktop-only
  stickiness must gate in JS — `SettingsTabs` already did and keeps that
  behavior; it is unchanged.
- **Chrome as one sticky unit**: `DashboardView` wraps the view tabs and the
  date-nav row (chevrons, period label, ⋮ menu) in a single sticky block
  (`top: var(--app-shell-header-offset)`, opaque background, bottom divider,
  `zIndex` 10) at **every** breakpoint, so period context + navigation stay
  reachable on phones. The existing pre-paint `ResizeObserver` measurement now
  covers the whole unit (`chromeHeight`, renamed from `tabsHeight`).
- **Docking consumers**: Week v2's pinned day header receives the combined
  height via a renamed prop (`tabBarOffset` → `chromeOffset`) so it docks flush
  beneath both chrome rows; the Week view's `WeekDayLabelStrip` was upgraded
  from `position: relative` to sticky with the same docking formula (new
  `chromeOffset` prop, `zIndex` 9) — its horizontal pan tracking
  (`weekDayIndex`) is unchanged.
- **Accepted limitations**: the Day/Week time rulers and Month weekday-initial
  rows live inside `@mantine/schedule`'s content-height `ScrollArea`s and can't
  pin during page scroll without restructuring those views; Agenda is
  intentionally header-less. Documented in docs/desktop-responsive.md §1.4.

No behavior change for pure helpers; no schema impact.
Verification: typecheck/lint/test pass; manual device-emulation pass across all
five dashboard views at ~390px (pin order app header → chrome → view header,
no overlap; ⋮ menu above pinned bars; dark-mode backgrounds opaque;
SettingsTabs mobile unchanged).

## 1.98 Pinned time rulers, compact chrome, overlap fix (Phase 3av)

Follow-up to §1.97 after device use surfaced three issues.

- **Columns overlapped the pinned bars while scrolling**: `@mantine/schedule`
  stacks its sticky-left columns and scrollbars at z-index 12-13/20 inside the
  same stacking context as the dashboard's pinned chrome (z 10) and Week strip
  (z 9), so grid content sliding beneath painted over them. The chrome now
  renders at z-index 50 and pinned view headers at 45 — above every
  library-internal layer.
- **Time axis scrolled away in Day/Week**: the library's time-labels row is
  sticky only inside its own content-height ScrollArea viewport (which never
  scrolls vertically). Both rows are now hidden and replaced by a shared
  `TimeRulerStrip` that pins beneath the chrome and translates its hourly
  track by `-scrollLeft` via direct DOM transforms (Week v2 header mechanics):
  slot width probed from each view's `--resources-*-view-slot-width` var,
  scroll tracked via `onScrollPositionChange`, initial offset synced through
  the views' merged `scrollAreaProps.viewportRef`. Side fix: Week passes the
  real `startScrollDateTime={monday} 07:00:00` instead of a nonexistent
  `startScrollPosition: {y}` prop that was silently ignored.
- **Date-nav row too tall**: nav controls (chevrons, ⋮, New event) shrunk
  43px → 36px, period label lg → md, margins/padding sm → xs. The pinned
  chrome block drops ~20-25px on every breakpoint.

Verification: lint/typecheck/test pass; manual mobile-emulation check of all
five views (ruler alignment during horizontal pan, no overlap under pinned
bars, docked stacking order app header → chrome → strip → ruler → grid).

## 1.99 Owner hidden from invited-attendee lists; "Invited Attendees" rename (Phase 3aw)

The event owner appeared twice in the UI: `withCreatorInvited` (the creator is
always merged into `inviteeUserIds`) put the owner in both the "Owner" and
"People" rows of the event detail modal and both the "On behalf of" and
"People" rows of the wizard's review step. The data semantics are deliberate
and were kept — target-calendar derivation, schedule rows, the `{people}`
title token, and the audit/webhook snapshots all still carry the creator. The
fix is display-only:

- `EventDetail.tsx`: `peopleNamesResolved` filters out `payload.creatorId`, so
  the Owner badge no longer repeats in the list; owner-only events hide the
  section entirely via the existing `length > 0` guard.
- `EventForm.tsx` review: `reviewPeople` filters out
  `user:${effectiveCreatorId}` (the picked "On behalf of" user, or the
  acting user when blank). The calendar-preview `{people}` rendering is
  untouched — it must mirror the title the server writes.

"People" / "Invitees" labels were renamed to "Invited Attendees" at every
visible spot; the `{people*}` title tokens and code identifiers
(`inviteeUserIds`, `EventPeople`, `parseEventPeople`, the notes keys) are
unchanged:

- Event detail modal section (was "People"); wizard field label (was
  "Invitees"), multi-select user-group label (was "People"), and review row
  (was "People").
- Audit detail labels in `audit/format.ts`: `invitees` → "Invited Attendees",
  `inviteeUserCount` / `inviteeDepartmentCount` → "Invited attendee
  users/departments (count)" (legacy rows only).
- Webhook payload reference: `event.invitees` described as "Invited attendees
  by display name (includes owner)".

Tests: `format.test.ts` label expectations updated. Docs:
event-lifecycle.md §1.4.1 (Invited Attendees step, Review step) and §1.8.3
(preview note that the title token deliberately keeps the owner while the
review row drops it).

Verification: lint/typecheck/test pass.

## 1.100 Form validation feedback: toast + scroll-to-error + validate-on-blur

Client-side validation failures in the create/edit user modal (and every other
Mantine form) had no visible feedback: the only output was the small red text
under the invalid fields, which in a scrollable mobile modal sits far from the
submit button — tapping Create/Save with bad values appeared to do nothing.
Mantine's form core already set the field errors on a failed submit; the gap
was purely in the feedback layer.

- New `src/lib/ui/validationFeedback.ts` ("use client"): `firstErrorField`
  (pure, unit-tested) plus `showValidationFailure(errors, getErrorNode)`,
  which scrolls the first invalid field into view
  (`scrollIntoView({ behavior: "smooth", block: "center" })`) and shows a red
  "Check the highlighted fields" toast — the same wording the server path
  uses in `roster/actions.ts`.
- Every Mantine form now passes the failure handler as the second
  `form.onSubmit` argument and sets `validateInputOnBlur: true` (inline error
  as soon as a field loses focus; the default `clearInputErrorOnChange` clears
  it on the next edit): `UserForm`, `DepartmentForm`, `EventTypeForm`,
  `WebhookForm`, `TemplatesForm` (both forms), `SettingsForm` (both forms),
  and the dashboard `EventForm` final submit.
- `EventForm` nuance: only the `getInputProps`-bound fields (title, location)
  get blur validation and scroll-into-view — the wizard's `goNext` already
  gates every other step via `validateField`. The toast still fires on any
  final-submit failure, including cross-field rules.

Tests: new `validationFeedback.test.ts` (3 cases). Verification:
lint/typecheck/test pass.


## 1.101 Duplicate-key crashes fixed: drizzle-wrapped error inspection

Creating or editing a user (or event type) with an already-used phone or
shortname crashed the server action instead of showing a friendly toast.
Root cause: **drizzle-orm wraps every failed query in a `DrizzleQueryError`**
(`"Failed query: <sql>\nparams: ..."`) and hides the underlying postgres-js
`PostgresError` — the one carrying the SQLSTATE `code` (`23505`) and
`constraint_name` — in `.cause`. The `isUniqueViolation` / `violatedConstraint`
helpers in `roster/actions.ts` and `eventTypes/actions.ts` checked `"code" in
error` on the wrapper (which has no `code`), so the duplicate-key branches
never matched and the catch fell through to `throw error`, producing an
"Uncaught (in promise)" in the browser with no toast or field error. The same
wrapper also leaked raw SQL into user-facing toasts wherever a catch used
`error.message` directly (department rename/delete, all event
create/update/delete).

- New `src/db/pgErrors.ts` (pure, no imports, unit-tested in
  `pgErrors.test.ts`):
  - `findUniqueViolation(error)` walks the error's `.cause` chain
    (cycle-guarded) and returns `{ constraintName }` for the first SQLSTATE
    `23505` it finds, else null.
  - `isDbQueryError(error)` detects the drizzle `"Failed query: "` wrapper
    anywhere in the chain.
  - `describeError(error, fallback)` returns the error's own message for real
    errors (e.g. Google API failures) and the caller-supplied fallback when
    the message is raw SQL from a failed DB query.
- `roster/actions.ts` + `eventTypes/actions.ts`: removed the broken local
  `isUniqueViolation` / `violatedConstraint` helpers; `createUser` /
  `updateUser` / `createEventType` / `renameEventType` now resolve the
  constraint through `findUniqueViolation`, so a duplicate phone/shortname/name
  returns the proper field-targeted error (the existing client handling then
  toasts + marks the field) instead of throwing.
- `roster/actions.ts` (department create/rename/delete) and `events/actions.ts`
  (event create/update/delete): DB failures now surface a friendly
  `describeError` fallback ("Could not create/update/delete the …") instead of
  the raw `Failed query: <sql>` text.

Tests: 13 new cases in `pgErrors.test.ts`. Verification:
lint/typecheck/test/build pass.

## 1.102 Slow-network responsiveness: optimistic chrome + client-router reuse

On a flaky connection the app read as unresponsive: taps produced no visible
reaction until the RSC response landed. Two root causes:

1. **No client-router reuse at all** — Next.js defaults
   `experimental.staleTimes.dynamic` to 0, so every soft navigation to a
   dynamic page blocks on the network even if the same URL was fetched moments
   ago.
2. **Controls rendered from committed state only** — the bottom nav's active
   highlight derives from `usePathname()` (updates when a navigation commits)
   and the dashboard's Tabs value / period label derive from server-resolved
   props, so both stayed frozen while a slow fetch was in flight.

Fixes, split into "chrome answers instantly" and "repeat navigations are
near-instant":

- `next.config.ts`: `experimental.staleTimes.dynamic = 120` — within 2 minutes
  a revisited URL renders its cached client-router payload with zero network
  wait (hard loads / new param combos / force-refresh nonce remain distinct
  cache keys that always hit the server; consistent with the data layer's
  60s-fresh + 30min-SWR tolerance).
- `AppShellShell.tsx`: optimistic nav highlight — `tappedHref` lights the
  tapped item immediately (`active = matches(pathname) || href ===
  tappedHref`), cleared by a render-phase sync on committed `pathname`, plus a
  6 s `NAV_TAP_REVERT_MS` timer so a stalled/offline tap can't stick. Each
  nav `<Link>` wraps its content in `PendingDim` (`useLinkStatus`) for a
  subtle dim-while-pending affordance.
- `DashboardView.tsx`: optimistic date-nav chrome — new `shownView` /
  `shownMonth` / `shownDate` state leads the server props after any tab /
  chevron / Today / picker interaction; one render-phase sync keyed on
  `(view, month, date, isPending)` adopts committed props whenever the
  transition ends (success *or* failure), healing offline navigations.
  Shifts compose on `shown*`, so rapid taps accumulate instead of being eaten
  by navigate()'s no-op guard. Grid/ruler/agenda rendering,
  `usePersistUiState`, and chevron click dispatch stay on committed props;
  the skeleton flavor and period label select by the optimistic view (same
  contract as `loading.tsx`). Tab scroll-into-view keys off `shownView`.

Docs: `docs/loading-transitions.md` §1.9 (optimistic chrome) + §1.10
(client-router reuse window); AGENTS.md loading checklist gained point (6).
Verification: lint/typecheck/test/build pass.

## 1.103 Quick links: admin-managed link menu launched from the Calendar FAB (Phase 3ay)

Admins register a list of quick links (label, URL, icon, icon color, enabled,
order) that staff can open from the Calendar page. The launcher is
deliberately non-customizable and deliberately distinct from the grey
"More options" kebab: a light-`accent` FAB with an `IconLink` glyph beside
the "New event" FAB (mobile) and a 36px *labelled* "Quick links"
light-`accent` chip in the date-nav row (lg). Tapping always opens the menu
— even with a single link, never a direct jump — with page-scale rows
(16px text, ~44px touch targets) and a direction-aware pop transition
matching the kebab menu; a menu item (colored icon + label) opens its URL
in a new tab. With zero enabled links the launcher is hidden entirely.

- `src/db/schema.ts`: new `quick_links` table (`label`, `url`, `icon` key,
  `color` palette name or null, `enabled`, `sort_order`, timestamps;
  `quick_links_sort_idx`) — migration
  `drizzle/0018_youthful_quentin_quire.sql` (+ committed `drizzle/meta`).
- `src/lib/quickLinks/`: `icons.ts` (curated 40-key icon registry — keys +
  human labels, pure; the tabler components live in
  `src/components/QuickLinkIcon.tsx` so server code never pulls icon
  components), `validate.ts` (label ≤ 40 chars; URL ≤ 2048 chars and
  http/https only — `javascript:` & co. rejected; icon normalized to the
  default key, color via the event types' `normalizeEventColor`),
  `queries.ts` (order: `sortOrder ASC, createdAt ASC`), `actions.ts`
  (`createQuickLink` / `updateQuickLink` / `deleteQuickLink` /
  `moveQuickLink`, all audited as `quickLink.*` with human-readable icon
  label / color label in `details`, both `/settings/quick-links` and
  `/dashboard` revalidated).
- `moveQuickLink` first renumbers every row to a unique ascending
  `sortOrder` inside a transaction, then swaps with the neighbor — a move
  therefore always takes effect, even when legacy rows share `sortOrder`
  values.
- `src/components/QuickLinksMenu.tsx`: one Mantine `Menu` with a
  caller-supplied single-element trigger (`top-end` above the amber mobile
  FAB, `bottom-end` below the labelled lg chip), page-scale items
  (`10px 12px` padding, `md` font, 20px icon) and a `pop-top-right` /
  `pop-bottom-right` 150ms ease transition chosen by opening direction —
  same feel as the kebab menu — plus `QuickLinkIconPicker.tsx`, a
  tappable grid
  of icon buttons — not a Select, so taps on mobile never raise the keyboard
  (same rationale as the color swatches and department badges).
- Settings → new **Quick Links** tab (between Webhooks and General; admin
  gate inherited from the settings layout): desktop table / mobile cards per
  the standard list tab — row/card tap opens the form modal (label, URL,
  icon picker, `ColorSwatchPicker` for the icon color, enabled switch,
  delete-with-confirm in edit mode); per-row up/down + delete actions live on
  the row/card itself; add entry point is the mobile-only FAB / full-size
  desktop button.
- Dashboard `page.tsx` reads `listQuickLinks()` in its existing
  `Promise.all` and hands only enabled links to `DashboardView` (new
  `quickLinks` prop); `DashboardView` renders the launcher only when the
  list is non-empty — mobile inside the existing `formState === null`
  toolbar (so the minimized-form toolbar never collides), desktop in the nav
  row beside "New event".
- Audit: `AUDIT_ACTIONS.quickLinkCreate/Update/Delete`
  (`quickLink.create|update|delete`) + labels in `audit/format.ts`, plus
  `label` / `url` / `icon` / `order` field labels.

Verification: `pnpm lint` / `typecheck` / `test` / `db:generate` drift check
all pass.

Post-review fixes (same day): user QA on the first build reported (1) the
launcher looked identical to the existing grey kebab, and (2) both bottom-right
FABs missing on mobile. Fix for (1) is the amber labelled design above. For
(2): a headless-Chromium E2E (Playwright, logged in via the auth API) at
every viewport ≤991px (mobile and desktop UA) renders both FABs correctly —
not reproducible; the session's long-running dev server (started during the
original build) was restarted, and the launcher markup was simplified in the
same pass (the trigger is now a single element cloned by `Menu.Target`
directly, no `Box` wrapper). E2E asserts: launcher visible at all mobile
widths, labelled chip at lg, menu opens on click at both breakpoints with the
pop transition, item click opens the URL in a new tab, outside click closes.

Second polish pass (same day, user feedback): dropped the amber "Quick links"
header band entirely (the amber trigger already identifies the menu), sized
items to page scale (`10px 12px` padding, `md` 16px text, 20px icon ≈ 44px
rows) and gave the dropdown the kebab's pop transition, direction-aware
(`pop-top-right` below the lg chip, `pop-bottom-right` above the mobile FAB),
150ms ease.

## 1.104 Fullscreen calendar view (Phase 3az)

The Calendar's date-nav row gains a 36px **Fullscreen** toggle
(`IconArrowsMaximize` / `IconArrowsMinimize`, `aria-label` + `aria-pressed`,
hover/focus tooltip) sitting between the Next chevron and the "New event"
button. Active mode — *immersive mode* — hides the shell header, the bottom
nav, and the lg sidebar, and enters the page-level Fullscreen API so the OS
status bar / browser UI go with them. The icon flips while active, so the
same button is the in-page exit path; `Esc` (desktop) and the Android
status-bar edge gesture also exit.

Why the shell owns the state:

- The header / bottom nav / sidebar are rendered by `AppShellShell`, so it
  is the only component that can hide them and re-pin the main content.
  `DashboardView` is a grandchild and only *controls* the mode through a
  context.
- `src/lib/ui/immersiveMode.ts` (new): `ImmersiveModeContext` +
  `useImmersiveMode()` returning `{ active, enter, exit }` (throws outside
  the provider, like the other context helpers).
- `AppShellShell` holds `immersive` state with two callbacks:
  `enter` = set state + `document.documentElement.requestFullscreen({
  navigationUI: "hide" })` (`.catch(() => {})` — a browser that rejects or
  lacks page fullscreen, i.e. iOS, keeps the CSS-only focus mode;
  `navigationUI: "hide"` hides the mobile browser toolbar on Chrome/Edge);
  `exit` = clear state + `document.exitFullscreen()` when active
  (idempotent either way). A `fullscreenchange` listener syncs the state
  from `document.fullscreenElement`, so leaving fullscreen via the browser
  never strands the chrome hidden.

The CSS half is one class on the AppShell root:

```
.app-shell-immersive {
  --app-shell-header-offset: 0px;
  --app-shell-navbar-offset: 0px;
  --app-shell-footer-offset: 0px;
}
.app-shell-immersive > header,
.app-shell-immersive > nav,
.app-shell-immersive > footer { display: none; }
```

This works because Mantine 9's AppShell drives its main-section padding and
its fixed header/navbar/footer entirely from `--app-shell-*` custom
properties injected on `:root`, while this app already overrides
`--app-shell-header-offset: 56px` on `.app-shell-root` (a closer-ancestor
declaration beats the `:root` inheritance for every descendant — the same
mechanism, now reused for all three offsets). The header/footer/navbar are
semantic `<header>/<footer>/<nav>` direct children of the root Box, so the
direct-child `display: none` is precise. Everything else follows the vars
with zero per-view changes: the AppShell main padding collapses to just
`--app-shell-padding`, and the dashboard's sticky chrome + Week/Week v2
pinned strips (all `top: var(--app-shell-header-offset) …`) re-pin to the
viewport top. Where the Fullscreen API is unsupported (iOS standalone,
`viewport-fit=cover`), the sticky chrome takes
`padding-top: env(safe-area-inset-top)` so the tabs clear the still-visible
status bar (the var is 0 everywhere else).

The floating toolbars take the freed bottom-nav space too: while active,
both dashboard `FloatingToolbar`s (the mobile FAB row and the
minimized-draft restore/discard pair) get
`bottomOffset="var(--app-floating-bottom-offset-immersive)"` —
`env(safe-area-inset-bottom) + 16px`, dropping the 56px nav allowance while
keeping gesture-bar clearance. The var is declared on `:root` in globals.css
because the Affix portals its content to `<body>`, outside the immersive
class's scope (same reason as the other FAB clearance vars).

Exit paths, in priority of surprise:

| Trigger                                    | Path                                                        |
| ------------------------------------------ | ----------------------------------------------------------- |
| Tap the toggle while active                | `exit()` → state off + `exitFullscreen()`                    |
| `Esc` (desktop) / Android status-bar edge  | browser fires `fullscreenchange` → shell sync → state off    |
| Navigate away from `/dashboard`            | `DashboardView` unmount cleanup calls `exit()` (shell stays mounted) |

Deliberately **not** remembered: the mode is transient (no `cloudy2.ui`
cookie entry) — a refresh or navigation starts with the chrome up.

```mermaid
flowchart LR
  subgraph dash [DashboardView]
    BTN["Date-nav toggle<br/>(aria-pressed)"]
    UM["unmount cleanup → exit()"]
  end
  subgraph shell [AppShellShell]
    ST["immersive state"]
    EN["enter(): setState +<br/>requestFullscreen({navigationUI:'hide'})"]
    EX["exit(): setState + exitFullscreen()"]
    FS["fullscreenchange listener<br/>(Esc / Android edge) → sync state"]
    CSS[".app-shell-immersive on root:<br/>hide header/nav/footer,<br/>zero --app-shell-*-offset"]
  end
  BRA["browser / OS:<br/>status bar + browser UI"]

  BTN -- "active? exit() : enter()" --> ST
  EN --> ST
  EX --> ST
  FS --> ST
  ST -- "className" --> CSS
  EN -.-> BRA
  EX -.-> BRA
  UM --> EX
```

Files: `src/lib/ui/immersiveMode.ts` (new), `src/components/AppShellShell.tsx`,
`src/app/globals.css`, `src/app/(protected)/dashboard/DashboardView.tsx`,
`AGENTS.md`.

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all
pass. (On-device QA notes: verify Android Chrome status-bar hiding, iOS
CSS-only fallback, `Esc` restore, and the sticky-chrome re-pin in each
dashboard view.)

## 1.105 Event invitee picker: cross-department invites for non-admins (Phase 3b0)

The event form's **Invited Attendees** picker is no longer role-scoped: a
regular user can now tag **any** active user and **any** department, not just
people from their own department. This reverses the §1.38 decision that the
*creation* picker "stays role-scoped (own-department scope for non-admins,
per creation permission semantics)" — inviting is a cross-department
coordination act that every role may perform, not an admin-only one. The
§1.38 change itself (cross-department *filter* options via `filterUsers`) is
untouched.

Why it was safe to relax: a logical event already materializes as one Google
calendar copy per involved department (`deriveTargetCalendarIds`,
`src/lib/events/targets.ts`), and the service account owns every department
calendar, so cross-department copies always write cleanly — the old
restriction was a deliberate permission choice, not a technical limit. The
server actions never validated invitee departments either; the scope lived
entirely in the option lists built in `dashboard/page.tsx`.

- **Page** (`src/app/(protected)/dashboard/page.tsx`) — `pickerUsers` is now
  `activeUsers` for every role (the `ownUsers` block is gone) and
  `inviteeDepartments` is the full `calendars` list. The role default for the
  *view* (a non-admin's default calendar = own department) is untouched —
  `isAdmin`/`ownDepartmentId` still drive `defaultCalendars`, so only the
  creation picker widened. `peopleNames` derives from `pickerUsers`, so the
  event detail modal now resolves cross-department invitee/creator names
  instead of dropping them (previously a latent gap, e.g. when an admin
  creates an event "on behalf of" someone who later edits it).
- **EventForm** (`src/app/(protected)/dashboard/EventForm.tsx`) — copy only:
  the picker placeholder "My department only" → "Tag people or departments"
  (the old text described the removed restriction), and the empty-state line
  → "No active users or departments to tag yet." — reachable only with an
  empty roster now, and the old second clause was wrong for unassigned
  users, who can *now* create by tagging someone else's department.
- **EventDetail** — prop comment "(role-scoped roster)" → "(active roster)".
- **Unchanged:** `creatorGuard`/`ownershipGuard` (`src/lib/events/guards.ts`)
  — non-admins still create only as themselves and edit/delete only their
  own events; the admin "On behalf of" step; filter-dialog user options
  (`filterUsers`); the `active`-status filter (inactive users remain
  un-inviteable); the multi-copy create/update flows (`event-mutations.md`),
  which already handled arbitrary department targets.

Edge cases:

- Non-admin **without** a department: previously picker empty and creation
  blocked ("Assign yourself to a department or tag an invitee"); now they can
  invite anyone and the event lands in the tagged departments.
- Editing an admin-created event (creator = this non-admin) that already
  carries cross-department invitees: chips now resolve to labels; previously
  the ids had no option label.

```mermaid
flowchart LR
    R["listUsers()"] --> A["activeUsers<br/>(status = active)"]
    A --> P["pickerUsers — full roster<br/>(was: own dept for non-admins)"]
    C["listCalendars()"] --> D["inviteeDepartments — all departments<br/>(was: own dept only)"]
    P --> F["EventForm invitee picker"]
    D --> F
    P --> N["peopleNames map<br/>(detail-modal labels)"]
```

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass. (No pure
helper changed, so no new unit tests; `dashboard/page.tsx` is I/O-bound per
repo convention.) Manual QA: as a non-admin, the event form lists all active
users + all departments; creating an event with a foreign-department
invitee lands copies in both department calendars, and the detail modal
shows both sets of names.

## 1.106 UserSelectModal: badge picker dialog replaces the user multi-selects (Phase 3b1)

A new shared component, `UserSelectModal` (`src/components/UserSelectModal.tsx`),
replaces the searchable user `MultiSelect` dropdowns everywhere: the
**Invited Attendees** field of the create/edit event wizard and the **Users**
group (variant `"search"`) of the dashboard / parade-state filter dialog.
The dialog shows every option as a toggleable badge — users grouped under
their department (section per department, "No department" last) — with a
search box on top that removes non-matching badges immediately as you type
(an option stays when its label, its extra search terms, *or its section
label* match, so typing a department name keeps the whole department). The
selection is staged in a draft and committed only on the confirm button
(Clear / Cancel / Confirm footer); the draft lives in a child that mounts
with the modal, so it re-initializes from the caller's `values` on every
open — the `FilterModalBody` pattern.

Data crosses the boundary as `Record<sectionLabel, string[]>` of option ids
(in = `values`, out = `onConfirm`), so callers keep their own id domains.
Pure logic lives in `src/lib/users/userSelect.ts` (`PickerOption`/
`PickerGroup` types, `optionMatchesQuery`, `sortOptionsInGroups`,
`buildUserGroups`, `filterPickerGroups`, `selectionByGroup`) with 16 unit
tests in `userSelect.test.ts`. Badge visuals follow the existing toggle idiom
(`UnstyledButton` + `aria-pressed` + filled/light `Badge`, default blue).

- **EventForm** (`src/app/(protected)/dashboard/EventForm.tsx`) — the mixed
  `NoKeyboardMultiSelect` (users + departments in one prefixed-value field)
  is gone. The invitees step now shows the label + description, a small
  **Select** trigger, and a read-only summary row of the current selection
  (creator badge in `brand`, department badges in `accent`), and opens
  `UserSelectModal` (`zIndex 300` over the z-250 event dialog) with a flat
  `Departments` section plus `buildUserGroups` sections per department. The
  `invitees` form field **keeps its `user:`/`dept:` prefixed shape**, so
  `splitInvitees`, the title preview, the review step and the submit payload
  are unchanged. `applyInviteePicker` re-adds the locked creator first and
  re-appends previously selected ids that no longer appear in the picker
  (now-inactive users), so editing can't silently drop them — the only
  behavioral delta vs. the old dropdown is that such ids can no longer be
  *removed* (they were visible only as raw chips there). The admin
  **"On behalf of"** single-select stays a `NoKeyboardSelect`.
- **FilterModal** (`src/components/FilterModal.tsx`) — variant `"search"`
  groups no longer render `NoKeyboardMultiSelect`: the group shows the
  selected options as light badges (or an "All <group>" placeholder) beside
  a small **Select** trigger that opens a nested `UserSelectModal`
  (`zIndex 200` over the filter dialog, confirm label "Apply"). `FilterOption`
  gained optional `search` and `department` fields; when options carry
  `department`, `searchGroupPickerGroups` builds per-department sections,
  else one flat section. The draft/`changed`/`cleared`/`resolveFilterApply`
  machinery, the "My Events" quick action and the empty = no filter
  semantics are untouched, so confirming with an empty selection clears the
  filter as before.
- **Dashboard / parade-state pages** — `filterUsers` gains
  `departmentName: string | null` (both `page.tsx` already had the data via
  `RosterUser.department`) and both views pass it into the Users group as
  `department`, which is what switches the dialog to per-department sections.

```mermaid
flowchart TB
    subgraph EventModal ["Create/edit event wizard"]
        A["Invitees step: summary badges + Select trigger"] --> B["UserSelectModal<br/>(z 300)"]
        B -->|onConfirm Record section→ids| C["applyInviteePicker<br/>prefixes user:/dept:<br/>re-adds locked creator"]
        C --> D["form field invitees<br/>(shape unchanged)"]
    end
    subgraph Filter ["FilterModal (dashboard / parade state)"]
        E["Users group: selected badges + Select trigger"] --> F["UserSelectModal<br/>(z 200, Apply)"]
        F -->|onConfirm| G["handleGroupChange(label, ids)<br/>→ draft → resolveFilterApply"]
    end
```

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass (592 tests,
incl. the new 16). Manual QA: create/edit event — invitees step shows the
selected badges, the dialog lists all users grouped by department with a
live search, the creator can't be dropped; dashboard + parade-state Filters
→ Users opens the grouped dialog, My Events parity, empty confirm clears the
filter.

## 1.107 UserSelectModal: fixed-height picker dialog (bugfix)

Typing a specific query into `UserSelectModal`'s search box collapsed the
badge sections and the modal — a `centered` auto-sized Mantine `Modal` —
shrank and re-centered toward the viewport middle on **every keystroke**.
With the mobile keyboard open the shrunken dialog landed behind it, hiding
exactly the search box and the few matching badges the user was about to
tap; on desktop it was a jarring jump at best. Root cause: search input,
all badge sections and the footer shared one unbounded `Stack` inside the
modal body, so content height (and therefore centered position) tracked
the filter result size.

The fix makes the picker a **fixed-height three-region dialog** so filtering
never resizes it:

- `Modal` styles: `content` gets
  `height: min(560px, calc(100dvh - 96px))` + `display: flex; flex-direction:
  column`; `body` gets `flex: 1; min-height: 0; overflow: hidden`.
- Body is now a column: the search `TextInput` pinned at the top, a
  scrollable inner `Stack` (`flex: 1; overflowY: auto; minHeight: 0`) holding
  only the badge sections / "No matches" message, and the Clear / Cancel /
  Confirm footer pinned at the bottom. Native scrolling (no `ScrollArea`),
  matching existing patterns.

No logic changes: query state, draft toggling and the pure helpers in
`src/lib/users/userSelect.ts` are untouched; both call sites inherit the fix
unchanged (FilterModal's nested picker at `zIndex 200`, event wizard invitees
at `zIndex 300`). Section spacing inside the new scroll region is preserved
by making it a `Stack` (same `gap: md` the outer stack provided before).

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass (592 tests).
Manual QA: open dashboard ⋮ → More Filters → Users → Select, type a
narrowing query — the dialog holds its size, the search box stays put under
the header, remaining badges scroll internally, footer stays reachable at
mobile and desktop widths.

## 1.108 UserSelectModal: badge taps keep the search focus (bugfix)

Follow-up to 1.107: tapping a badge dismissed the mobile soft keyboard.
The badges are real `UnstyledButton`s, so pressing one transferred DOM
focus off the search `TextInput` — the keyboard closed after every tap,
forcing the user to re-open it before filtering for the next person. That
broke the picker's core loop of *search → tap → search → tap*.

Two complementary techniques keep the input focused (the same pattern
Mantine's Combobox uses):

- Badge buttons get `onMouseDown={(event) => event.preventDefault()}`,
  which stops the press from moving focus at all (desktop + Android).
- `toggle()` explicitly refocuses the input via a new `searchRef`
  (`searchRef.current?.focus()`), covering iOS Safari, which blurs during
  touch handling before the synthesized `mousedown` but honors `focus()`
  called inside the click gesture.

The ✕ clear-search `ActionIcon` gets the same treatment so clearing a
query doesn't drop the keyboard either. Footer Clear / Cancel / Confirm
buttons are deliberately untouched — they end the flow and should release
the keyboard. Keyboard users are unaffected: `preventDefault` on
`mousedown` doesn't interfere with Tab/Enter/Space activation or the
`aria-pressed` toggle semantics.

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass (592 tests).
Manual QA: filter down by query, tap several badges consecutively — the
soft keyboard stays up between taps on mobile widths; typing continues
immediately after each tap on desktop.

## 1.111 Month view hides adjacent-month days (bugfix)

The dashboard's Month view rendered Mantine's `MonthView` with its defaults
(`withOutsideDays: true`, `consistentWeeks: true`), so the 6-week grid carried
dimmed days from the previous month (top) and the next month (bottom). Those
cells showed bare date numbers but **never any events**: the page only fetches
the viewed month (`fetchMonthEvents` → one Google month read), while Mantine
positions events across the whole 42-day grid range — adjacent-month events
simply were not in the data. Users saw next-month dates in the current month's
view with nothing on them (e.g. the August cells trailing July's grid).

Fix (chosen with the user over fetching the full grid range): pass
`withOutsideDays={false}` to `MonthView` (`DashboardView.tsx`). Mantine then

- restricts event positioning to the month proper (`getMonthRange` returns
  `[1st, last]`), so no outside-day event can render or be expected;
- renders the leading/trailing week cells as empty static `data-static` divs
  (no date label, no events, `pointer-events: none`) that keep the 7-column
  week layout; and
- skips the 6-week padding, because `MonthView` computes
  `consistentWeeks && withOutsideDays` — the grid shrinks to the month's
  actual week count (4-6 rows).

`monthGridRows()` (`src/lib/events/datetime.ts`), which sizes the Month
loading skeleton, had two pre-existing drifts from the real grid: it counted
rows Sunday-first (`getUTCDay()` baseline) while the grid is Monday-first, and
assumed the padded shape. It now counts the Monday-first weeks overlapping the
month without padding: `ceil(((getUTCDay + 6) % 7 + daysInMonth) / 7)`.
Expectations updated in `datetime.test.ts` (2026-05 → 5, 2026-02 → 5, new
2027-02 → 4; 2026-08 stays 6). No data-fetch change: the page still fetches
exactly one month, so the events-cache design and `docs/events-cache.md` are
untouched; other views (Week, Week v2, Day, Agenda, parade-state) are
unaffected.

Verification: `pnpm test`, `pnpm typecheck`, `pnpm lint` pass. Manual QA:
dashboard Month view shows no adjacent-month dates (empty corner cells only),
row count varies per month (e.g. May 2026 renders 5 rows) and the loading
skeleton matches; a month-end multi-day event still renders clipped to the
month and stays clickable.

## 1.112 Month view range-reads its 6-week grid; adjacent-month days show their events (supersedes 1.111)

Reversal of 1.111's design. Hiding the adjacent-month days made the dimmed
grid cells disappear, but the follow-up report showed Mantine still positions
multi-day events across **full week rows** (`getWeeksInRange` expands the
month range to the Monday on/before the 1st → Sunday on/after the last day,
and `calculateEventPositionInWeek` only clips against the *week* edge). With
the outside cells emptied out, a cross-month bar (e.g. Aug 30 – Sep 2 viewed
in August) painted straight across the now-empty Sep 1/2 cells. The decision,
revisited with the user: fetch the whole grid instead of hiding its days.

Changes:

- `src/lib/events/datetime.ts`
  - `monthGridMonths(month)` (new, pure): the months the `MonthView` grid
    displays — the Monday on/before the 1st (`weekDays(\`${month}-01\`)[0]`)
    through `MONTH_GRID_WEEKS` (6) full weeks, via `monthsInRange`. Two
    months when the 1st is a Monday, three otherwise.
  - `addDays(dateOnly, n)` (new, pure): small signed-day helper.
  - `monthGridRows(month)`: back to the padded shape
    (`Math.max(ceil((daysFromMonday + daysInMonth) / 7), 6)` = fixed 6),
    matching Mantine's `consistentWeeks` padding now that the outside days
    are visible again.
- `src/app/(protected)/dashboard/page.tsx`: the month view now calls
  `fetchRangeEvents({ months: monthGridMonths(month), ... })` (the range path
  already dedupes boundary-spanning copies per calendar × Google id, applies
  filters after the fetch, and gates its adjacent-month prefetch on the
  whole-range `allServed`). Day/Agenda keep single-month reads;
  `fetchMonthEvents` stays exported for them and parade-state.
- `DashboardView.tsx`: `withOutsideDays={false}` reverted — the grid keeps
  Mantine's defaults (dimmed outside days, 6 rows), and with the grid months
  fetched those cells render their events. Cross-month multi-day events (full
  spans are what the cache stores — `mapGoogleEvent` never month-clips)
  render as one bar spanning the dimmed cells in both neighboring months'
  views, deduped to a single representative copy per logical event.
- Incidental fix in `monthsInRange`: it derived the month from the parsed
  **instant** (UTC+8 wall clock → UTC), so a date-only `YYYY-MM-DD` at
  midnight landed on the previous UTC day — a range starting on the 1st of a
  month was attributed to the previous month (e.g. a week starting Mon
  2026-06-01 fetched an extra `2026-05`; the new month-grid fetch did the
  same). It now reads the wall-clock months straight from the date part,
  matching its docblock; regression-tested.

Tradeoff: a *cold* month view can block on up to 3 months × N calendars of
Google `events.list` (concurrency ≤ 4 per month) versus one before; the
existing adjacent-month prefetch warms the grid's neighbors after any miss,
so subsequent month swipes mostly hit L1/L2.

Docs updated: `docs/events-cache.md` (§1.3 diagram, §1.4.1 key, §1.5.1 force
refresh, §1.8 prefetch, file index), `docs/desktop-responsive.md` §1.4,
`AGENTS.md` cache bullet. Verification: `pnpm test` (615), `pnpm typecheck`,
`pnpm lint` pass; new/updated cases in `datetime.test.ts`
(`monthGridMonths` incl. year boundary, `monthGridRows` padded, `addDays`,
`monthsInRange` midnight shift). Manual QA: August 2026 — dimmed Sep 1–6
cells visible with events on them; an Aug 30 – Sep 2 all-day event renders as
one bar spanning the dimmed cells (and again in the September view over the
dimmed Aug 31); a dimmed-day click opens the agenda listing that day's
events; detail/edit flows keep the full span; force-refresh works.

## 1.118 Departments settings: unified detail modal + assigned-user role overrides

 Rework of the admin Departments settings UX on top of the roster-sharing
 model. The list no longer shows the Google calendar ID or the per-row
 Share/Edit/Delete buttons; tapping a row (desktop) or card (mobile) opens one
 unified detail modal that replaces the three old modals, and the sharing
 section grows an inline role selector per assigned user so the admin can
 upgrade the assignment-auto-granted reader to writer/owner (or back down).
 The reconcile semantics needed no change — `diffAccess` only fills rules
 that are *missing*, so an upgraded assigned-user rule survives every
 reconcile-on-read/write; it is revoked like any other rule when the user
 leaves the department or changes email.

 Changes:

 - `src/lib/roster/shares.ts`
   - `DepartmentAccess` gains `assignedRoles: Record<string, string>` — each
     assigned email's live Google ACL role, read from the post-reconcile ACL
     list (empty `{}` on the department-missing and Google-unconfigured
     returns, and on the catch path).
 - `src/app/(protected)/settings/departments/`
   - `DepartmentTable.tsx`: the list reduces to name + external color
     (two-column desktop table; dot + name + color-label mobile cards).
     Rows/cards are keyboard-activatable (`role="button"`, `tabIndex=0`,
     Enter/Space, `aria-haspopup="dialog"`) and open the detail modal; the
     Share/Edit/Delete row buttons are gone. The delete confirmation modal
     is kept as a separate modal, triggered from the detail modal's
     "Delete department" button (the detail modal closes first). The create
     flow reuses the same modal with `calendar={null}` (settings fields
     only).
   - `DepartmentDetail.tsx` (new): one centered `size="md"` modal with the
     name + external-event-color form, a "Calendar access" section (calendar
     ID + copy + add-to-Google link, the sync warning, the owner badge, the
     assigned users each with an immediate-apply role `Select` wired to
     `updateDepartmentAccess` — no Remove button, access is
     assignment-managed —, the additional-access rows with role change +
     remove, and the add-another-person row), and a footer
     ("Save changes"/"Create department" + "Delete department"). All
     non-submit controls are Mantine `type="button"` by default, so only the
     footer submit saves the form. The body is a keyed child component:
     Mantine unmounts the modal content on close, so the Mantine form state
     and the access data reseed fresh on every open from the tapped row, and
     a save updates the list row in place (create refreshes the list).
   - `DepartmentForm.tsx`, `DepartmentShares.tsx`: removed (absorbed into
     `DepartmentDetail.tsx`).
   - `loading.tsx`: skeletons match the new shapes (single-line mobile cards,
     two-column desktop table).

 Docs updated: `docs/roster-sharing.md` (§1 intro, §1.2 goal, §1.3 diagram +
 warning, §1.5 `DepartmentAccess` bullet + line refs, §1.6 line refs +
 rename/delete notes, §1.8 renamed to the detail modal + assigned-override
 property + line refs, §1.9 revoke note, §1.10 override reuse + line refs,
 §1.12 file index + phase list; the stale `users/DepartmentShares.tsx` file
 entry dropped).

 Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (659) pass. Manual QA
 pending: open a department row on mobile + desktop; edit name/color and save;
 upgrade an assigned user to writer and reopen (role persists); add/remove an
 additional access; create + delete flows; empty state; keyboard row
 activation.

## 1.119 Event wizard modal: outside clicks and Escape minimize instead of discarding

The create/edit event dialog discarded the whole draft whenever the user tapped
the dimmed background or pressed Escape — one stray tap while reaching past the
open dialog wiped the partially-filled wizard. The wizard already ships an
explicit minimize path (header chevron → floating restore bubble, with the draft
kept alive in the `keepMounted` modal), so the "step away" gestures were
re-routed to it. Only the explicit X now discards.

Changes (all in `DashboardView.tsx`):

- New `minimizeForm()`: `setFormOriginRect(null)` + `setFormMinimized(true)` —
  shrinks into the bottom-right bubble instead of the tap origin (same behavior
  the header chevron had inline; the chevron now calls it too, deduplicated).
- The wizard's `Modal.Root` gets `onClose={minimizeForm}`. Per the installed
  Mantine v9 internals (`ModalBaseOverlay` / `use-modal`), the `onClose`
  callback is exactly what outside/overlay clicks (`closeOnClickOutside`,
  default on) and Escape (`closeOnEscape`, default on) invoke — both now
  minimize and keep the draft.
- `Modal.CloseButton` replaced with a plain `ActionIcon` (X, same subtle gray
  look) that calls `closeForm` directly: the built-in close button routes
  through `onClose` first (`ModalBaseCloseButton`), which would have minimized
  instead of discarding. The header X and the bubble's "Discard draft" X
  (unchanged) remain the only discard paths.
- A "Tap outside to minimize" caption floats **below** the dialog box,
  outside of it (no background, bare white text — the overlay under it is
  60% black in both themes). The dialog `Paper` clips everything inside it
  (`overflow-y: auto`) and Mantine's inner layer is a row flexbox with no
  usable sibling slot, so the caption is a `position: fixed` `Text`
  (z 260 — above the 250 overlay/layer, below the 300 restore bubble)
  pinned 8px under the measured Paper bottom, centered on its width.
  A `ref` on `Modal.Content` (delivered to the Paper `section` via
  `ModalBaseContent` → `FocusTrap innerRef`) feeds an effect keyed on
  `[formIsOpen, formMinimized]` that measures `offsetTop/offsetLeft/
  offsetWidth` — layout coordinates, stable through the transform-only
  open/close animation (`getBoundingClientRect` would read the mid-scale
  box), already viewport-relative because the Paper's offsetParent is the
  modal's fixed full-viewport inner layer. A `ResizeObserver` follows
  wizard-step height changes; `window` + `visualViewport` resize listeners
  catch soft-keyboard/rotation re-centering a dialog shorter than its
  max height. The caption cross-fades with the modal's own 250ms
  transitions and is `pointer-events: none`, so tapping it lands on the
  overlay → minimizes — which is what it advertises.

The resulting gesture matrix:

| Gesture              | Before | After               |
| -------------------- | ------ | ------------------- |
| Outside/overlay tap  | discard | minimize (bubble)  |
| Escape               | discard | minimize (bubble)  |
| Header X             | discard | discard            |
| Header chevron       | minimize | minimize           |
| Bubble chevron-up    | restore | restore            |
| Bubble X             | discard | discard            |

```mermaid
stateDiagram-v2
    [*] --> closed
    closed --> open: tap day cell / New event / edit
    open --> open: wizard steps
    open --> minimized: chevron / outside tap / Escape
    minimized --> open: restore bubble
    open --> closed: header X / save (onDone)
    minimized --> closed: discard bubble
```

Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (659) pass. Manual QA
pending: open the create wizard half-filled on mobile + desktop, tap the
overlay / press Escape — the dialog shrinks into the bottom-right bubble with
the draft intact; restore and continue; the header X still discards; saving
from a restored state submits the event.

## 1.122 Pin/Unpin tab: SWR cache invalidation (bugfix)

Pinned dashboard view tabs were lost after switching views or reloading once
the 1.121 SWR caches landed. A same-day label-only commit (renaming the
Week/Week v2 tabs to Week (H)/Week (D)) was the first change noticed in the
batch, but pinning is keyed on view *values*
(`month`/`week`/`weekv2`/`schedule`/`agenda`) — never on labels — so the
rename was ruled out by diff inspection + the 35 `uiState` unit tests. The
real cause was the 1.121 `app-documents-swr` / `app-rsc-swr` caches.

The pin toggle is a `cloudy2.ui` cookie-only state change: no navigation,
no URL change, no `router.refresh()` — so none of the mutation-site
invalidations fired. Both SWR caches are URL-keyed, so every `/dashboard`
document or RSC payload rendered *before* the toggle still carries the
pre-pin `pinnedViews` prop. When one is served afterwards (F5 / PWA cold
start for documents, or a soft navigation back to a previously visited view
URL for RSC), the render-phase prop sync in `DashboardView` re-seeds the
local `pinned` state and `usePersistUiState` converges the cookie to the
payload — silently deleting the fresh pin.

Fix: `togglePinView` (`DashboardView`) now calls
`invalidateCurrentPathCaches()` fire-and-forget beside `setPinned` — the
same helper and the same cost as the mutation sites, minus the refresh
(in-session state is already correct after the toggle). The next dashboard
load after a toggle bypasses the instant cache, an accepted trade-off for a
rare action. Unpinning takes the same path, so a stale payload can no longer
resurrect an unpinned tab either.

`docs/pwa-offline.md` §1.7 now lists the pin toggle as an invalidation
trigger (plus its file-index row), and the AGENTS.md PWA bullet mentions it.

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass. Manual QA:
pin a tab → F5 → pin survives; pin → switch view → switch back → pin
survives; unpin → switch back → the star is gone; a PWA cold open after a
pin change shows the new tab order.

## 1.123 SW build-update takeover: build-versioned page caches + controllerchange reload (bugfix)

Report: "sometimes while navigating between views in the calendar, changing
pages to parade state, contacts, and settings, the UI loads an older version
of the page (and sometimes even older versions of the web app itself)." Two
independent gaps in the 1.121 PWA layer caused it:

**Gap 1 — the page caches were not build-versioned.** The `app-documents-swr`
/ `app-rsc-swr` runtime caches persisted under fixed names across service
worker versions (unlike the precache, which Serwist cleans up between
versions). After a Vercel deploy, the new SW (`skipWaiting` +
`clientsClaim`) takes over and its `StaleWhileRevalidate` handlers happily
serve the old build's cached documents — HTML whose `<script>` tags reference
`/_next/static/chunks/<old-hash>.js`, which 404 against the new build. The
page then renders stale or broken; the background revalidation fixes the
cache entry for the *next* open, not the one just served.

**Gap 2 — the running tab never learned about the build swap.** The SW file
is served from a fixed URL (`/serwist/sw.js`), so
`navigator.serviceWorker.controller.scriptURL` never changes across deploys,
and there was no `controllerchange` handling anywhere in the client. A tab
running the old build kept running it until a manual reload.

Fix (three parts):

1. **Build-versioned page cache names** (`src/lib/pwa/swRules.ts`): new pure
   helpers — `swCacheVersion(manifest)` computes a deterministic FNV-1a 32-bit
   token over the serialized SW precache manifest (every build's chunk hashes
   differ, so every build gets a different token); `documentCacheName(v)` /
   `rscCacheName(v)` derive the real names
   (`app-documents-swr-v<token>` / `app-rsc-swr-v<token>`); `isPageCacheName(name)`
   matches any build's page cache by prefix (including the legacy unversioned
   names). `APP_DOCUMENT_CACHE` / `APP_RSC_CACHE` became
   `APP_DOCUMENT_CACHE_PREFIX` / `APP_RSC_CACHE_PREFIX`.
2. **Wipe on activate** (`src/app/sw.ts`): an `activate` listener deletes
   every page-cache name this build does not own (prefix match), so
   old-build entries — and the legacy unversioned names — vanish the moment
   the new SW activates, for this build and every future one.
3. **Client swap detection** (`src/components/AppProviders.tsx` →
   `useSWUpdateReload`): listens for `navigator.serviceWorker`
   `controllerchange` and compares `ServiceWorker` **object identity** (not
   `scriptURL`, which is fixed by design). A reload fires only when the tab
   was already under control — the first-ever claim after install is
   excluded, so a normal initial install never flashes. On a real swap it
   runs `clearAllSavedPages()` (now prefix-matched in
   `src/lib/pwa/client.ts`, sweeping every build version) and
   `window.location.reload()`; the reload also drops Next's in-memory
   client-router RSC cache (`staleTimes.dynamic`), so no old-build payload
   survives in-page.

The activate wipe and the client clear are deliberately redundant: the wipe
closes the "fresh tab after deploy" hole (a tab opened after the new SW
claimed has no `controllerchange` in its lifetime), the client clear covers
the brief activate/claim race where an in-flight old-SW fetch could
re-store an entry under the old name after the wipe.

In-page "older data" *within the same build* (navigating back to a visited
URL within `staleTimes.dynamic` / the SWR window) is unchanged — that is the
intended instant-open design, with the "Saved · HH:MM" chip and the
force-refresh nonce as the escape hatch.

`docs/pwa-offline.md` gained §1.8 (deploy takeover, with sequence diagram);
§1.5/§1.6/§1.12/§1.13/§1.14/§1.15 updated for the versioned names and
prefix-matched helpers, sections renumbered; AGENTS.md PWA bullet updated.

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (696) pass;
`pnpm build` passes and the emitted SW bundle was inspected — FNV
versioning, the activate wipe, and both versioned runtime cache routes are
present. Manual QA pending on a real deploy: open the installed PWA on the
old build, deploy, navigate — the tab should reload once and come back on
the new build with no stale-chunk 404s and no old HTML.

## 1.124 Offline fallback: last-saved view + saved-views picker (Phase 3b4)

Report: "when offline / on a bad connection, a page is displayed instead of
the actual UI." The installed PWA showed the branded `offline.html` on icon
taps and on typed/refreshed URLs even while saved views existed in the SWR
document cache.

Root cause: the document cache is keyed by **exact URL**. Icon taps always
navigate to the start URL `/` (which 307-redirects server-side to the
remembered page), while the saved documents live under the deep-link URLs
actually visited (`/dashboard?view=…&date=…`, F5'd URLs) — different cache
keys. So the most common offline entry points (`/`, a new day's `?date=`, a
never-F5'd deep link) missed the cache, and the old `handlerDidError` went
straight to the dead-end offline page despite good saved documents in the
same cache.

Fix (SW fallback chain, `src/app/sw.ts` `handlerDidError`):

1. **Query-less requests → last-saved view.** Icon taps (`/`) and bare F5s
   are a page-level intent, not a specific view. `lastSavedDocument()` scans
   this build's `app-documents-swr-v<token>` cache, picks the entry with the
   newest `Date` header via the new pure `newestSavedView()` helper
   (`src/lib/pwa/swRules.ts` — missing timestamps sort oldest, ties to the
   first entry), stamps it with the extracted `stampCachedResponse()`
   (shared with the serve path, so the "Saved · HH:MM" chip renders) and
   serves it. The un-stamped original is re-stored under the requested URL,
   so repeat offline opens are stable and normal SWR revalidation applies on
   reconnect. `stampDocument()` is now idempotent (replaces an existing
   `__C2_STAMP__` script) so this is safe.
2. **Query requests → saved-views picker.** A `?view=…&date=…` deep link is a
   specific intent — silently substituting a different view would mislead, so
   these fall through to `offline.html`.
3. **`public/offline.html` now lists the saved views.** An inline script
   (the page is static and precached, so it cannot import shared code — it
   prefix-matches `app-documents-swr` across build versions and the small
   nav-label map is deliberately duplicated there) enumerates every document
   cache, dedupes by URL keeping the newest, sorts newest-first and renders
   up to 12 tappable rows ("Calendar — Saved · 28 Aug 09:12"). Tapping a row
   is a navigation the SW serves straight from cache, so the picker works
   fully offline. With a genuinely empty cache (first install, right after a
   deploy wipe, sign-out) the list stays hidden and the page shows the
   "open once while online" hint — there is no on-device data in that case.

Docs: `docs/pwa-offline.md` §1.9 rewritten (two-step fallback), §1.3 diagram
gained the fallback branch, §1.13 lists the new helper (34 test cases),
§1.15 file index updated; AGENTS.md PWA bullet updated.

Verification: `pnpm lint`, `pnpm typecheck`,
`pnpm vitest run src/lib/pwa/swRules.test.ts` (34) pass; `pnpm build` passes
(72 precache entries, SW bundles clean). Manual offline matrix pending on a
device: open a few view/date URLs online → DevTools Network → Offline → icon
tap (expect last-saved view + chip, not the offline page) → typed URL never
visited (expect picker, row taps open the saved views) → F5 of a visited URL
(direct SWR hit) → clear site data → offline open (empty picker, correct).

## 1.125 Offline fallback reachability fix (bugfix for 1.124)

Report (prod): still seeing the bare "You're offline / Connect to view the
calendar" page most of the time when offline, despite the 1.124 fallback
chain shipping `offline.html` as a saved-views picker.

Root cause: the branded `offline.html` **was precached** (confirmed in the
production-built SW at `.next/server/app/serwist/sw.js.body`:
`{url:"/offline.html",revision:"…"}` — the SSG'd `/serwist/sw.js` route
bakes the manifest at build time), but `handlerDidError` looked it up with a
bare `caches.match("/offline.html")`. Serwist stores revisioned precache
entries under a versioned cache key —
`https://<origin>/offline.html?__WB_REVISION__=<hash>` — and the Cache API
treats the query string as significant, so the plain match always returned
`null` and the fallback dropped through to the minimal inline
`"You're offline"` string. This predates 1.124: the old
`caches.match("/offline.html")` never fired in any build, so the branded page
was dead on arrival in both the old and new handlers.

Fix (`src/app/sw.ts`):

1. **`serwist.matchPrecache("/offline.html")`** in place of `caches.match`.
   `Serwist.matchPrecache` (Serwist.ts:696) resolves the URL through
   `getPrecacheKeyForUrl` → the `_urlsToCacheKeys` map populated at precache
   install, so it opens the precache cache under the revisioned key and finds
   the page. The `serwist` instance is created later in the module; the
   closure reference is safe because `handlerDidError` only runs once the SW
   is active (install succeeded → the map is populated).
2. **`OFFLINE_FALLBACK_HTML`**: the absolute-last-resort inline response is now
   a self-contained branded copy of `offline.html` (same styling + saved-views
   picker script, kept in sync with `public/offline.html` — the canonical
   source) instead of a bare error string. It is only reachable if merging an
   active SW's precache lookup fails, so it is a safety net, not a path.

Why the dev-mode red herring doesn't matter: `@serwist/turbopack` sets
`disablePrecacheManifest` outside production (`self.__SW_MANIFEST` is
`undefined` under `pnpm dev`), so offline behavior only exercises fully in a
production build. The fix is validated against the `.next` production output.

Docs: `docs/pwa-offline.md` §1.9 gains the matchPrecache rationale
(`__WB_REVISION__`); AGENTS.md PWA bullet unchanged.

Verification: `pnpm vitest run src/lib/pwa/swRules.test.ts` (34) +
`pnpm lint` + `pnpm typecheck` pass; `pnpm build` passes and the emitted
`sw.js.body` still lists `/offline.html`; manual prod check: build →
deploy → open online → go offline → deep-link to an unvisited URL → branded
picker appears (not the bare error string); icon tap offline → last-saved
view. The user's existing prod deployment must be rebuilt to pick up the new
SW (the client's `controllerchange` takeover reloads under run it; otherwise
close/reopen the PWA once after deploy).

## 1.126 Offline UX: last saved view for every offline navigation; offline.html drops the picker (Phase 3b4)

Report: the saved-views picker page (added in 1.124) is confusing — a
technical-looking list of labels + "Saved · 28 Aug 09:12" timestamps that
forces the user to choose *which* offline copy they want.

Decision: auto-serve instead of ask. Any offline navigation that isn't an
exact cache hit now gets the **most recently saved document**, regardless of
whether the URL carries a query. The served page already communicates the
offline/recency context on its own:

- `OfflineBanner` (`src/components/OfflineBanner.tsx`) — amber "You're
  offline" strip on every route.
- The "Saved · HH:MM" stamp chip (`window.__C2_STAMP__` → `initialSavedAt`
  in `DashboardView`) — shows how stale the copy is.

So there is no separate landing page to explain the situation; a never-visited
deep link (`?view=…&date=…`) simply opens the latest saved content instead of
dead-ending. Exact-visit deep links are still served by the SWR cache before
`handlerDidError` (unchanged), and `/login` is never routed to the document
handler (`isCacheableDocumentRequest` excludes it — swRules test), so no
guard was needed for it.

Changes:

1. **`src/app/sw.ts` `handlerDidError`**: removed the query-less gating
   (`hasQuery`) so `lastSavedDocument(request)` runs for every
   GET-navigate doc request. `lastSavedDocument` is unchanged — it still
   re-stores the un-stamped original under the requested URL, so repeat
   offline opens of that URL become direct cache hits.
2. **`public/offline.html`**: dropped the saved-views list + picker inline
   script. It now only appears when the document cache is genuinely empty
   (first install, right after a deploy wipe, sign-out) — in which case the
   list would have shown "no saved views" anyway — so it is a plain branded
   explainer: "You're offline — reconnect to keep using the app" + a Try
   again (`/`) button. No `<script>` at all now.
3. **`OFFLINE_FALLBACK_HTML`** (`src/app/sw.ts`): the twin inline copy was
   simplified to match (same markup/CSS, no list/script).

Docs: `docs/pwa-offline.md` §1.9 rewritten (single-step fallback, no picker),
§1.3 mermaid collapsed to one fallback branch, §1.11/§1.15 corrected to point
at `DashboardView` for the chip (the old `SavedDataChip.tsx` was merged into
it); AGENTS.md PWA bullet updated.

Verification: `pnpm lint` + `pnpm typecheck` +
`pnpm vitest run src/lib/pwa/swRules.test.ts` (34) + `pnpm test` (714) pass;
`pnpm build` passes (72 precache entries) and the emitted `sw.js.body` no
longer contains the picker script (the only `app-documents-swr` strings are
the versioned cache-name helpers). Manual offline matrix (prod build):
icon tap → newest saved view + chip; F5 visited URL → direct SWR hit;
never-visited deep link with `?view=&date=` → newest saved view (no picker);
clear site data → offline open → plain branded explainer (no list).

## 1.131 Department hierarchy (Phase 3b6)

Report: smaller departments make up bigger ones in reality, but the org model
was flat — a department's parade-state headcount only counted its own direct
members, so a parent department's true size was invisible, and neither the
page nor the clipboard report could express the grouping.

Decision (confirmed with the user): departments nest under a **parent
department** (any depth); a user still belongs to exactly one *direct*
department. On parade state the parent renders as a **nested section** whose
`NAME (present/total)` header aggregates direct + all sub-department members;
the attendance clipboard report stays **flat blocks in tree order** (parent
before children, depth-first, no indentation) with the same aggregated
counts. Moving a department reorders it **among its siblings only** (the
whole subtree moves; for flat data this is identical to the old global
up/down swap), and deleting a parent **promotes its children to top level**
(the delete confirm warns).

Changes:

1. **Schema** — `calendars.parent_id`: nullable self FK (`ON DELETE SET
   NULL`), indexed. The self-reference needed the `references(():
   AnyPgColumn => calendars.id)` getter-type annotation to break the
   TypeScript inference cycle. Migration 0030 (+ committed
   `drizzle/meta/0030_snapshot.json`). `sort_order` stays globally unique and
   now encodes **preorder tree rank**, so every flat calendar listing
   (`listCalendars`, `listDepartments`, filter options) is already in tree
   order.
2. **`src/lib/roster/hierarchy.ts` (new, pure, unit-tested)** —
   `buildDepartmentTree` (cycle-safe: missing parents and self/descendant
   links degrade to top level), `findDepartmentNode`, `flattenDepartmentTree`
   (preorder), `descendantIds` (cycle-safe), `parentOptionsFor` (excludes
   self + descendants), `moveAvailability`, `moveInTreeOrder` (sibling swap;
   subtree moves; null at sibling ends). 15 tests.
3. **`src/lib/roster/actions.ts`** — `createDepartment` accepts an optional
   `parentId` (must exist; new child ranked at the end of the parent's
   subtree, shifted rows renumbered in the same transaction);
   `renameDepartment` can change the parent (self/descendant rejected via
   `descendantIds` — moving to top level always allowed; affected preorder
   ranks renumbered in the same transaction; audit diff gains `parent`);
   `moveDepartment` swaps with the adjacent sibling via `moveInTreeOrder`
   and re-ranks the result (also closing legacy gaps); `deleteDepartment`
   unchanged mechanically (FK set-null promotes children). Audit details are
   human-readable names, per the audit convention.
4. **Settings → Departments** — the detail modal gains a **Parent
   department** field (plain `NoKeyboardSelect` — short list, no search;
   options = "No parent (top level)" + `parentOptionsFor`); the list renders
   the tree (desktop: indent depth + new Parent column; mobile: indent +
   "In {parent}" line); up/down arrows disable per `moveAvailability`
   (sibling-scoped); the delete confirm names the sub-departments that will
   be promoted.
5. **Parade state** — the page passes each calendar's `parentId`;
   `ParadeStateView` builds the section tree (`buildDepartmentTree` + direct
   members; "Unassigned" stays a terminal top-level section) and renders
   recursively: header with **aggregated** counts (`departmentTreeHeadcount`
   — direct + descendants; attendance mode counts checked the same way),
   direct members' card grid, nested sub-departments indented per level. A
   section renders when it or a descendant has users. `buildAttendanceReport`
   now takes the nested shape and emits flat preorder blocks with aggregated
   headers (a department without direct users gets no block; its people still
   count toward the ancestor's header). Day-total counter, filtering,
   attendance storage, and the Calendars filter (per-calendar, parent
   selection does **not** auto-include children) are unchanged.

Non-goals: no auto-include of child calendars in the Calendars/user filters,
no change to user→department assignment (one direct department), no
change to event targeting or ACL sharing (a parent/child link is not an
access relationship).

Docs: `docs/roster-sharing.md` gains §1.7 (Department hierarchy &
parade-state aggregation: model, pure-helper table, management UI, parade
render + clipboard format with example; Mermaid tree) and the ERD/
action-table/file-index updates; sections 1.7–1.12 renumbered to 1.8–1.13
(cross-references updated); AGENTS.md gains a hierarchy bullet;
`progress.md` one-liner.

Verification: `pnpm vitest run src/lib/roster/hierarchy.test.ts` (15) +
updated `attendanceReport`/`headcount` cases; `pnpm test` (748) +
`pnpm lint` + `pnpm typecheck` pass; `pnpm db:generate` clean (schema-drift
check) and migration 0030 applied to the dev DB; `pnpm build` passes; dev
server smoke: `/parade-state`, `/settings/departments`, `/dashboard` all
respond. Manual QA debt: on-device check of the nested parade sections +
clipboard text against a real hierarchy (not yet seeded in dev data).

## 1.138 Day/Week (H) timeline zoom (Phase 3b7)

Report: the Day and Week (H) schedule views lay out 24 fixed-width hour
columns (60px mobile / 72px desktop for Week (H); 80px for Day), so a phone
could only ever show a thin slice of the day and a desktop a fixed amount —
there was no way to fit more of the week in view for an overview or expand
the columns for detail.

Decision (confirmed with the user): floating zoom-in/out buttons beside the
grid, a single zoom level shared by Day and Week (H), discrete levels 0.5–2
in 25% steps (1 = today's widths), and the level remembered across relaunch
(like the pinned tabs — not URL-backed, since zooming never navigates).

Changes:

1. **`src/lib/ui/slotZoom.ts` (new, pure, unit-tested)** — `ZOOM_LEVELS`
   (`0.5, 0.75, 1, 1.25, 1.5, 2`), `clampZoom` (finite number → nearest
   level, else `null` — a corrupted cookie degrades, never throws),
   `stepZoom` (clamped at the extremes), and the width math
   `weekSlotWidth(zoom, isDesktop)` / `daySlotWidth(zoom)`, which emit
   `calc(<base>×<zoom>rem * var(--mantine-scale))` so Mantine's own scale
   still applies. 9 tests.
2. **`src/lib/ui/uiState.ts`** — `dashboard.zoom` joins `DashboardUiState`
   and is normalized through `clampZoom`; excluded from
   `DASHBOARD_STATE_KEYS` (not URL-backed, like `pinnedViews`).
   **`uiStateClient.ts`** keeps `zoom` in the overflow-degrade scalar set.
3. **`page.tsx`** — resolves `initialZoom` from the **raw** cookie (survives
   the `_fresh`/`edit` whole-cookie skip, defaulting to 1) and seeds it into
   `DashboardView` before first paint (no width jump on a cold open).
4. **`DashboardView.tsx`** — client `zoom` state (seeded from the prop,
   written back via `usePersistUiState`); the zoomed width is written to the
   views' `--resources-*-view-slot-width` CSS var through each view's `style`
   prop (Mantine sizes the day container from that var and lays events out as
   percentages of it, so slots *and* events re-flow with no JS geometry
   work); `zoom` added to the ruler-measurement `useLayoutEffect` deps so the
   pinned hour ruler + Week (H) day-label strip re-measure on every change.
5. **`src/components/GridZoomControls.tsx` (new)** — a floating vertical
   pair (zoom-in on top) parked just inside the grid's right edge, below the
   right pan button; reuses `GridPanControls`' fixed-position / visible-slice
   tracking (resize + page scroll + ResizeObserver) and chrome. Rendered
   whenever the schedule grid is shown — unlike the pan buttons it shows even
   when the grid fits without overflowing.

Non-goals: no per-view independent levels, no zoom for Week (D) (its columns
are day-granularity), Month or Agenda; no change to slot granularity
(60-min columns) or row height; zooming keeps the grid's horizontal
`scrollLeft` in px (no time re-anchoring).

Docs: `docs/dashboard-views.md` gains §1.5 (Timeline zoom: levels, controls,
the CSS-var mechanism, ruler follow, persistence, scope; Mermaid flow) and
the file-index/related-docs updates (file index renumbered to §1.6);
`docs/ui-state.md` adds `zoom` to the stored shape, normalization, overflow
keep-set, server read and the persist table; `docs/grid-pan.md` notes
`GridZoomControls` shares the anchor mechanics; `docs/desktop-responsive.md`
§1.4 slot rows + the CSS-var gotcha mention zoom; `progress.md` one-liner.

Verification: `pnpm test` (775) + `pnpm lint` + `pnpm typecheck` pass; no
schema change (`db:generate` clean). Manual QA debt: on-device sweep of the
zoom levels (ruler/day-strip alignment at 0.5× and 2×, relaunch restore,
breakpoint flip at a non-default zoom).

## 1.140 Dev environment isolation (separate Neon + Google accounts)

Report: deployments went straight to prod (`main`) because the `dev` branch's
preview deployment shared every Vercel env var with production — same Neon DB,
same Google service account, so dev activity would write to prod calendars
and data.

Decision (confirmed with the user): **account-level isolation** — a separate
Neon account/project for the dev database and a separate Google account for
the dev side, not just new projects inside the existing accounts. The dev DB
is **fresh, migrations-only** (`db:seed` deliberately skipped — it inserts
departments with fake calendar IDs like `dept-operations@cloudy.local`, which
would break a real service account); departments/users are recreated in-app
on the dev deployment so `createCalendar` makes real calendars under the dev
SA. Dev KAH breach emails use the dev Google account's own Gmail app password
via `SMTP_URL` (no Workspace delegation in dev).

```mermaid
flowchart LR
    subgraph PROD["Production (main)"]
        PV["Vercel prod env vars"] --> PDB[("Prod Neon<br/>(original account)")]
        PV --> PGA["Prod service account<br/>(original Google account)"]
    end
    subgraph DEV["Preview (dev)"]
        DV["Vercel preview env vars"] --> DDB[("Dev Neon<br/>(new account, migrations-only)")]
        DV --> DGA["Dev service account<br/>(new Google account)"]
        DGA --> DGC["Dev-owned calendars<br/>(created in-app)"]
        DV --> DSM["SMTP_URL → dev Gmail<br/>app-password inbox"]
    end
    CI["CI"] -- "main push · DATABASE_URL" --> PDB
    CI -- "dev push · DATABASE_URL_PREVIEW" --> DDB
```

Changes:

1. **Neon (console)** — new account/project `cloudy2-dev` (pooled connection
   string, matching prod's style); `pnpm db:migrate` applied locally — all 14
   tables confirmed; no seed.
2. **Google (console)** — new Google account: GCP project `cloudy2-dev`,
   Calendar API enabled, service account `cloudy2-dev` + JSON key → base64
   (`GOOGLE_SERVICE_ACCOUNT_BASE64` on Preview); Gmail app password for the
   same account → `SMTP_URL` test inbox.
3. **Vercel (console)** — every env var split into Production/Preview values
   (table in [`developer-guide.md`](developer-guide.md#19-deployment-vercel));
   `GOOGLE_DELEGATE_EMAIL` removed from Preview; `NEXTAUTH_URL` stays unset
   everywhere; `ENABLE_EXPERIMENTAL_COREPACK = 1` unchanged.
4. **CI (`.github/workflows/ci.yml`)** — new `migrate-preview` job, a clone of
   the prod `migrate` job gated `if: github.ref == 'refs/heads/dev'` with its
   own `concurrency.group: db-migrate-preview`, using the new
   `DATABASE_URL_PREVIEW` repo secret.
5. **Docs** — `AGENTS.md` Vercel gotchas bullet rewritten (isolation + the
   calendars-table warning); `developer-guide.md` §1.9 gains the
   Production/Preview env table + warning blockquote; `progress.md` §1.5
   refreshed + changelog one-liner.

> **Standing rule:** never point a data-copied DB (e.g. a Neon branch of prod)
> at a different service account — the `calendars` table stores **Google
> calendar IDs**, so copied rows would target the wrong calendars.

Non-goals: no second Vercel project (per-env values on the single project keep
the git-flow setup); no prod-data clone in dev (the calendar-ID trap above);
no Workspace delegation for the dev account (SMTP covers dev emails).

Verification: migration applied to the dev DB and tables confirmed over a
read-only connection; `pnpm lint` + `pnpm typecheck` pass (docs/CI-only
changes, no source touched). Deploy-side QA (env split + first dev-department
calendar + breach email + migrate-preview job) tracked in §1.4 of progress.md
until executed.

## 1.141 Bootstrap-admin KAH crash fix (bugfix)

Report: the first admin login on the isolated dev preview 500s with
"Cloudy hit a problem"; Vercel logs showed `select "group_id" from
"kah_group_members" where "kah_group_members"."user_id" = $1` failing with
Postgres `22P02: invalid input syntax for type uuid: "admin"`.

Root cause: the admin-password login path (`auth.ts` authorize) returns a
**synthetic identity** `{ id: "admin", name: "Admin", role: "admin", phone:
null }` — by design, since the bootstrap admin can exist before any user
rows do. But the protected layout (`layout.tsx`) calls
`userHasKahGroup(session.user.id)` on **every authenticated render**, and
`kahGroupsForUser` (kah-status page) does the same; both send the id straight
against the uuid column `kah_group_members.user_id`, and Postgres rejects the
cast. Phone logins are unaffected (they resolve real user UUIDs). `main`
carried the same latent crash since the KAH integration (`1e0cabd` /
`9bf2600`) — no admin-password login had happened on prod since.

```mermaid
flowchart LR
    A["Admin password login"] --> B["authorize → id: 'admin' (synthetic)"]
    B --> C["Protected layout"]
    C --> D["userHasKahGroup('admin')"]
    D --> E["kah_group_members.user_id = 'admin'"]
    E --> F["Postgres 22P02<br/>(uuid cast)"]
    F --> G["500 → 'Cloudy hit a problem'"]
    D -. "guard: isUuid('admin') = false" .-> H["return false — no query"]
```

Fix: a pure `isUuid` helper in `src/lib/kah/status.ts` (canonical UUID
regex, case-insensitive), guarding both `userHasKahGroup` (returns `false`)
and `kahGroupsForUser` (returns `[]`) for non-UUID ids — the bootstrap admin
is not a roster row, hence belongs to no KAH group, and the admin nav hides
the KAH entry anyway. 4 unit tests added (`status.test.ts`).

Reviewed alternatives: resolving the admin password to a real `role='admin'`
user row when one exists (bigger blast radius — the synthetic identity is
woven into audit payloads and snapshots) — deferred as a possible enhancement.
Audited every other `session.user.id` usage: the rest feed text columns
(audit actor, notes creator, webhook payloads) or string comparisons, where
`"admin"` is valid.

Non-goals: no change to the admin identity shape; no DB backfill (no data
involvement); no behavioral change for phone logins.

Docs: `progress.md` one-liner (this section).

Verification: `pnpm test` (779, +4) + `pnpm lint` + `pnpm typecheck` pass;
no schema change (`db:generate` clean). Deploy verification: admin login
renders the shell on the dev preview (and prod after the dev → main merge).

## 1.142 KAH Status: admins always see the page with all groups

Report: after the dev environment shipped, the user noticed the KAH Status
nav entry appears on dev but not prod. Not a code difference (same commit) —
the entry is membership-gated (`hasKahGroup` from `userHasKahGroup`), and on
prod the viewer was the bootstrap admin (synthetic `id: "admin"`, never a
member) with no KAH groups in the prod DB yet.

Decision (confirmed with the user): admins should **always** see the KAH
Status page and see **all** KAH groups, not just their memberships — the
admin view mirrors what the breach check reasons about.

Changes:

1. **`src/components/AppShellShell.tsx`** — the admin nav is now
   `[CALENDAR, PARADE_STATE, CONTACTS, KAH_STATUS, SETTINGS]` unconditionally;
   the member branch keeps the `hasKahGroup` gate.
2. **`src/app/(protected)/layout.tsx`** — admins skip the
   `userHasKahGroup` lookup entirely (`Promise.resolve(false)`), so the
   synthetic admin id never hits the uuid-typed query on protected renders.
3. **`src/app/(protected)/kah-status/page.tsx`** — admins resolve groups via
   `listKahGroupChecks()` (all groups, same `KahGroupCheck[]` shape, takes no
   user id so the synthetic id is irrelevant); members keep
   `kahGroupsForUser`. Passes `allGroups={isAdmin}` to the view.
4. **`KahStatusView.tsx`** — new optional `allGroups` prop: a dimmed
   "Admin view — showing all KAH groups" hint under the date header and an
   adjusted empty state ("No KAH groups exist yet." vs "You are not part of
   any KAH group."). Rows/cards/table unchanged.

Docs: `docs/kah.md` §1.7 rewritten (admin path in prose + Mermaid branch) and
the §1.8 file-index rows updated; `docs/admin-guide.md` / `docs/user-guide.md`
/ `docs/developer-guide.md` one-liners; `progress.md` one-liner.

Non-goals: no change to member visibility; no change to the breach-check
logic; no new admin-only columns or actions on the page (still read-only).

Verification: `pnpm test` + `pnpm lint` + `pnpm typecheck` pass; no schema
change. Deploy verification: admin login shows the tab and lists all groups
on the dev preview; a member login behaves exactly as before.

## 1.144 Highlight my entries across dashboard views (Phase 3b8)

Report: roster members struggle to find their own entries among everyone
else's in the calendar views; the Users filter narrows results but the user
wanted an always-on visual indicator too. Suggestions reviewed and refined
with the user: Week (D)/Week (H) — highlight the user's entire row; Month —
move the user's events to the top of each day's cell + highlighted border;
Agenda — same. Decisions confirmed: "mine" = created-by or tagged-on (the
Myself filter's semantics), Day view included, highlights stay on under the
Myself filter, and the Agenda keeps chronological order (highlight only —
reordering would break the time reading).

Changes:

1. **`src/lib/events/mineFirst.ts`** (new, pure + unit-tested) —
   `sortMineFirst(events, myIds)` stably partitions the events into
   mine-first blocks, each time-sorted (start → end → id tie-breaks).
   MonthView assigns each day's rows greedily in input order
   (`getMonthPositionedEvents` → `findAvailableRow`), so feeding this order
   makes the user's events claim the top rows of every day (topmost
   non-conflicting row; an earlier-placed multi-day event can still hold row
   1). With `maxEventsPerDay` this pushes more of *other* events behind
   "+N more" on dense days — the intended trade-off.
2. **`DashboardView.tsx`** — `myEventIds` (`eventMatchesUserFilter` against
   `currentUser`) drives: `monthEvents = sortMineFirst(...)` into MonthView;
   two `renderEvent` replacements (`renderMyMonthEvent` → `c2-my-event`
   amber ring, also in the "+N more" popup; `renderMyAgendaEvent` →
   `c2-my-agenda-event` amber bar/tint + semibold title) on the month grid,
   the Agenda tab and the month day modal; and `renderResourceLabel` now
   renders the current user's label as a `data-c2-my-row` marker span (amber
   dot + semibold shortname) shared by Day, Week (H) and Week (D). Week (D)
   additionally gets a `myRowId` prop.
3. **`WeekMatrixView.tsx`** — `myRowId` prop; the user's row's day cells are
   tinted uniformly light amber (wins over the today tint so the row reads
   as one block, matching the schedule views).
4. **`globals.css`** — the schedule row tint is structural CSS: the label
   cell is the only element containing the marker directly and the row the
   only element containing it through a direct child, so
   `.app-shell-root :has(> [data-c2-my-row])` /
   `.app-shell-root :has(> * > [data-c2-my-row])` tint exactly the label
   cell (accent-1 + inset accent-6 bar) and the whole row (accent-0). No
   dependence on Mantine's hashed class names (verified against the
   9.5.1 row DOM: `[groupCell, labelCell, slots]`, transparent rows/slots);
   the `.app-shell-root` scope lifts specificity over Mantine's own rules.
   Plus the `c2-my-event` ring (on the inner chip element, whose rounded
   background the outline follows) and `c2-my-agenda-event` styles.

Colors: brand amber `accent` family (secondary `#FBC02D`) — distinct from
event-type colors and the blue `brand` today/primary accents.

Boundary: only roster members get row highlights (no row ⇒ no marker); an
admin without a roster row still gets the event-level highlights for events
they created/tagged. All client-side — no cache, server or PWA impact.

Docs: `docs/dashboard-views.md` new §1.5 (per-view mechanics + Mermaid
flow), timeline-zoom/file-index renumbered to §1.6/§1.7, file index gains the
`mineFirst.ts` row; `progress.md` one-liner.

Verification: `pnpm test` (incl. 6 new `mineFirst` cases) + `pnpm lint` +
`pnpm typecheck` pass; no schema change. Manual check: all five views at
mobile + `lg` — row tint on the user's row only, month top rows + rings,
agenda rows highlighted in time order, admin-without-roster-row case, and
skeleton/empty states unaffected.

## 1.145 Dark-mode my-entry tint fix

Report: in dark mode the 1.144 row/label/agenda tint glared — it used the
near-white accent-0 (`#fff9e0`) / accent-1 (`#fff3c0`) creams, which Mantine
keeps at the same values in the dark scheme.

Fix (user chose the "balanced" strength): the tint now switches on color
scheme via two custom properties in `globals.css` — `:root` keeps
`--c2-my-row-tint: var(--mantine-color-accent-0)` /
`--c2-my-label-tint: var(--mantine-color-accent-1)` (light mode unchanged),
and `[data-mantine-color-scheme="dark"]` (the same dark selector
`globals.css` already uses for the tab underline) overrides them to darker
olive amber: row `#3d3200`, label `#4a3c00`. `#3d3200` is the exact dark
amber `ParadeStateView` already uses for its card tint, so the app stays
consistent. The `:has()` row/label rules and `.c2-my-agenda-event` consume
the variables; the Week (D) matrix reads them inline in its day-cell and
label-cell `background` styles, so its scheme-blind `myTint` prop chain
(`variantColorResolver` — which resolves against the base palette and cannot
follow the scheme) was dropped. The accent-6 bars, dot and month chip ring
are unchanged across schemes.

Docs: `docs/dashboard-views.md` §1.5 colors paragraph; `progress.md`
one-liner.

Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (785) pass; no
logic change (CSS variables + inline-style strings only).

## 1.147 Accessibility quick wins

Four assistive-tech gaps closed (stage 1 of the UI/UX improvement pass; the
stage's research also listed actionable empty states, a sticky month weekday
row and zoom time re-anchoring as later stages).

**Skip-to-content link.** `AppShellShell` now renders a `.c2-skip-link`
anchor as the app's first focusable element, before the AppShell root. It is
transformed above the viewport until keyboard-focused (`:focus-visible`),
then appears as a chip over the header; activating moves focus to
`AppShell.Main`, which carries `id="main-content"` + `tabIndex={-1}`. Styles
live in `globals.css` (`.c2-skip-link`). Stays functional in immersive mode.

**Status announcements (live region).** State changes with no toast were
invisible to screen readers. New `src/lib/ui/announcer.tsx`: `StatusAnnouncer`
(a persistent sr-only `role="status"` + `aria-atomic` region) mounts once in
`AppShell.Main` so it survives navigations, and module-level `announce()`
pushes text into it. Identical consecutive messages re-announce via a
clear-then-set timeout. Wired in `DashboardView`:
- view/period: one watcher on the optimistic chrome (`shownView` + a new
  `periodLabel` that also feeds the nav-row text) announces
  `"Month view, March 2026"`-style messages for tab taps, chevrons, Today,
  the date picker and agenda day changes; the first render only records a
  baseline (no page-load noise);
- filters: `filterCountMessage` (mirrors `activeFilterCount`'s group
  semantics) announces `"2 filters active"` / `"Filters cleared"` from
  More-Filters apply, the Myself toggle and Clear;
- zoom: the in/out handlers announce `"Zoom 125%"`.

**Loading announcements.** Skeletons are visual-only, so a new server-safe
`src/components/LoadingStatus.tsx` (sr-only `role="status"`, "Loading
calendar…" etc.) now rides every skeleton block: all 14 route `loading.tsx`
files plus the client-side swaps (dashboard `gridLoading`, parade-state
`contentLoading`, audit-log `listLoading`, pinned-events panel fetch).

**Count-badge text alternatives.** `FilterButton`'s aria-label becomes
`"Filters (2 active)"` with the visual Badge `aria-hidden`; the pinned-events
`Indicator` label is wrapped `aria-hidden` (the count already rides the
button's aria-label, so it isn't read twice).

Docs: new `docs/accessibility.md`; AGENTS.md architecture bullet + loading
rule; `docs/loading-transitions.md` §1.4/§1.13; `docs/developer-guide.md`
index.

Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (806) +
`pnpm build` all pass.

## 1.148 Actionable empty states

Empty pages were dead ends: a bare dimmed `Text` ("No users found.", "No
departments yet.", …) with no next step, even though nearly every one has an
obvious action. A shared `EmptyState` component (`src/components/EmptyState.tsx`)
now renders a muted icon, the message, and — where a natural next step exists —
exactly one action (button via `onAction`, or a client-side Settings link via
`actionHref`).

Wired in:

- **Settings tables** (all admin-only): the empty state carries the tab's own
  "Add …" handler (`openCreate`) — Users, Event Types, Quick Links, Webhooks,
  KAH Groups, Departments. Departments already had an inline button; it was
  restyled onto the shared component for consistency.
- **Users + Contacts** distinguish *filtered-to-zero* from *truly empty*: a
  search/filter hit renders "Clear search & filters" (Users) / "Clear search"
  (Contacts); the truly-empty state renders the Add/Manage action.
- **Audit log** "No log entries match these filters." → "Clear filters"
  (`resetFilters`, which clears search + all filter groups + dates).
- **Dashboard** schedule views' "no users" guard now offers "Clear filters"
  (Users filter active) or "Adjust filters" (opens the FilterModal) — the
  DashboardView has no role, so both actions are role-agnostic.
- **Role-aware Settings links** on admin-only fixes: Parade State
  ("Manage departments"/"Manage users"), Contacts ("Manage users") and KAH
  Status ("Manage KAH groups") link into the relevant `/settings/*` tab — but
  only for admins, via a new `isAdmin` prop threaded from each page's
  `requireSession()` role (KahStatusView reuses its existing `allGroups`
  flag). Non-admins keep the plain message.

Docs: `AGENTS.md` conventions bullet; `progress.md` one-liner.
`docs/accessibility.md` is unchanged (this is UX, not assistive tech).

Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (806) + `pnpm build`
all pass.

## 1.149 Sticky Month weekday-initials row

Mantine's `MonthView` renders its weekday-initials row *inside* a content-height
`ScrollArea`, so during page scroll the row scrolls away with the grid — the
long-standing "cannot pin without restructuring" limitation. Fix: the view now
passes `withWeekDays={false}` (a supported prop that suppresses the built-in row)
and a new `MonthWeekdayStrip` pins in its place, using the same sibling-strip
mechanics as the Week (H) day-label strip and the hour rulers.

`MonthWeekdayStrip` (`DashboardView.tsx`) is `position: sticky` beneath the
shared tabs+date-nav chrome (`top: calc(var(--app-shell-header-offset) + chromeHeightpx)`,
`z-index: 45`, opaque body background). Its inner 7-column track mirrors the
grid's geometry — `@mantine/schedule` enforces `--min-day-width: 5.25rem` (84px)
per column, so seven columns need at least 588px and the grid scrolls
horizontally on phones. The track gets `min-width: 588px` and each cell
`flex-basis: 100%/7` + `min-width: 84px`, matching the grid's own flex model, and
translates by `-scrollLeft` via `monthScrollAreaProps` (`viewportRef` +
`onScrollPositionChange` on the `MonthView`) — no re-renders. Weekday labels
come from the new pure `WEEKDAY_ABBREVIATIONS` constant (`Mon`…`Sun`, Monday-first,
matching the library's `firstDayOfWeek: 1` + `weekdayFormat: "ddd"`).

Only rendered with the real grid (`!gridLoading && view === "month"`); the month
skeleton keeps its own `WeekdayRow`. Immersive mode and the 62em desktop layout
work unchanged (the offset var zeroes/chrome-var model is shared).

Docs: `docs/desktop-responsive.md` §1.4 (limitation removed). Verification:
`pnpm lint` + `pnpm typecheck` + `pnpm test` + `pnpm build` pass.

## 1.150 Timeline zoom re-anchoring

Zooming the Day/Week (H) grids used to keep `scrollLeft` in px, so the visible
time shifted (the browser preserves the pixel offset while the slot width — and
thus the timeline's meaning — changes). Now zooming keeps the time at the
viewport's _center_ centered.

`reanchorScrollLeft(scrollLeft, viewportWidth, labelWidth, oldSlotPx, newSlotPx)`
(`src/lib/ui/slotZoom.ts`, pure + unit-tested) computes
`timePx = scrollLeft + viewportWidth/2 - labelWidth` (the center expressed in
timeline px, after the zoom-invariant sticky label column) and returns
`timePx * (newSlot/oldSlot) + labelWidth - viewportWidth/2`.

Wiring (`DashboardView.tsx`): a `prevZoomRef` records the prior zoom, and a
`useLayoutEffect` — declared *before* the ruler measurement effect so it reads the
corrected `scrollLeft` — runs only on a genuine zoom change. It measures the
realized new slot width via the shared `measuredWidth` probe (extracted from the
ruler effect's inline probe), derives `oldSlot = newSlot * oldZoom/zoom` (exact:
the widths scale by exactly the zoom ratio), measures the label-column width from
`--resources-*-view-resource/group-label-width` (group only when present), and
assigns the re-anchored `scrollLeft`. No re-anchor on mount/view-switch (the ref
guard), no per-frame work, no new scroll listeners.

Docs: `docs/dashboard-views.md` §1.6 (re-anchoring bullet + diagram node).
Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (811) + `pnpm build`
pass.

### 1.150 follow-up — zoom latency fix

Zooming the Day/Week (H) grids was delayed by the re-anchor + ruler layout
effects: each `measuredWidth` probe appended/removed a `<span>` to the grid root
and read `offsetWidth`, forcing repeated synchronous reflows of the large grid
before paint. Consolidated into a single `useLayoutEffect` that caches the
realized geometry (slot width at zoom 1 + label-column width, keyed by
view/breakpoint/group-presence) and probes only on a real geometry change — a
zoom derives both the new slot width and the re-anchor from pure arithmetic
(`baseSlotPx * ratio`), leaving the zoom path as one `scrollLeft` write. The
`measuredWidth` helper remains only for the mount/breakpoint probe.

## 1.151 Cold-open splash fix: streamed banner/KAH shell chrome (Neon scale-to-zero)

On Android, the PWA splash screen (manifest icon + background_color) sometimes
stayed up for 10s+ after the Neon free plan scaled the compute back to zero,
while iOS (no manifest splash — it uses a last-app snapshot) showed nothing.
Root cause: the `(protected)/layout.tsx` awaited `getBanner()` +
`userHasKahGroup()` (the first DB queries of the request) before it could render
the AppShell at all. A layout must resolve before its children stream, so the
browser received no meaningful HTML until the Neon cold start (which also
coincides with a cold Vercel function and a stale Google L2 read) completed —
no first paint, so the Android splash never dismissed. Cache-hit opens were
unaffected (the SW serves the stamped document instantly), hence "sometimes".

Fix: take the DB reads off the first-paint path and stream them:

- `(protected)/layout.tsx` now awaits only `requireSession()` (JWT, no DB) + the
  `cloudy2.ui` cookie, and passes the banner + KAH lookups to `AppShellShell` as
  `<Suspense>`-bound server-component slots.
- `(protected)/shellStream.tsx` (server): `ShellBanner` (awaits `getBanner()`),
  `ShellKahNav` (awaits `userHasKahGroup()`, skipped for admins), and
  `BannerPlaceholder` (a 25px spacer = the Suspense fallback).
- `src/components/ShellChrome.tsx` (client): `ShellChromeContext` +
  `useShellChrome` (the shell provides the setters; server-streamed client
  components consume them — context flows client-to-client across the RSC
  boundary), `AnnouncementBanner` (moved out of AppShellShell, measures its
  height through the context), `BannerLoaded` (reports resolved presence in a
  layout effect — a null result collapses the reserved slot before paint, so
  warm no-banner loads never flash the gap), and `KahNavFlag` (reveals the KAH
  Status nav entry).
- `AppShellShell` replaced the `banner`/`hasKahGroup` props with
  `bannerSlot`/`kahNavSlot` ReactNodes. `bannerActive` defaults true so the
  slot is reserved from first paint (a configured banner never shifts the
  header when its read resolves late); `bannerPx`/`--app-banner-height`/header
  height math unchanged, just gated on `bannerActive`. KAH nav item renders in
  sidebar + bottom nav once the probe resolves true (one-time pop-in for KAH
  members on cold opens).
- `manifest.ts` `background_color` → `#0D47A1` (brand navy), so the residual
  splash (first-ever open / post-deploy cache wipe) matches the app header
  instead of a black screen.

Net effect: a cold cache-miss open after scale-to-zero now paints the navy
shell + route skeleton in ~1-2s (function boot), dismissing the splash, while
the DB wakes in the background and the banner/KAH/content stream in. The
residual data wait is the free plan's cold start; second opens stay instant via
the SW document cache. No SW / skeleton / fade changes.

Docs: `docs/announcement-banner.md` §1.1/§1.3 (streaming + reserve/collapse +
diagram); `progress.md` one-liner.
Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (811) + `pnpm build`
(65 precache entries) all pass.

## 1.152 Android PWA splash, take two: lazy googleapis + precached launch shell

1.151 streamed the shell's DB reads out of the layout, which was correct but did
not shorten the splash: the user still saw the navy splash + icon for the whole
10s. Re-measuring found the diagnosis had been wrong twice over.

**What was actually blocking first paint.** Chrome dismisses the Android PWA
splash on the launch page's *first non-empty paint* (Chromium's
`WebappSplashScreenController`), so the splash's length is exactly
time-to-first-paint. Nothing on the server's first-byte path touched the DB
(`/` and the protected layout only decrypt a JWT and read cookies). What blocked
it was **module load**: `dashboard/page.tsx` imports `googleCalendarConfigured`
from the `@/lib/google` barrel, which statically imported `./real`, whose first
line is `import { google } from "googleapis"`. That umbrella package is ~200 MB
on disk and ~1.4 s to `require()`, and it executed on every cold serverless boot
*before rendering started* — so streaming the layout could not help.

**Why the previous launch route (removed) never fired.** It keyed the decision
on the newest saved view, but the runtime page caches are versioned per build,
wiped on `activate`, and additionally cleared by `clearAllSavedPages()` on
controller change — so after every deploy there was no saved view,
`launchDecision` returned `"network"`, and the skeleton never rendered. That is
exactly the state a post-deploy test is in. Two further defects: the `"instant"`
branch only fired when the saved view was *younger* than 5 min (i.e. when
nothing was cold anyway), and the skeleton's `fetch(location.href)` was a
non-navigate request, so it missed both the launch and document matchers, fell
to `NetworkOnly`, and its freshly downloaded HTML was discarded — after which
`location.replace` served the *stale* cached copy and fired a third revalidation.

**Fix A — googleapis off the cold-boot path.** `getGoogleIntegration()` (already
`async`) now loads `./real` with a dynamic `import()`; `googleCalendarConfigured()`
stays on `./config` (env-only). `index.ts` was the sole static importer of
`./real`, so this covers every route. Verified by A/B build rather than
inspection: with the static import the 12.3 MB googleapis chunk is
`EAGER-FOR-DASHBOARD=True`; with the dynamic import it is `False`, and the
built selector compiles to `await a.A(448360)` (Turbopack's async module
loader) inside a chunk containing zero `googleapis` references. A request served
entirely from the event cache now never loads it.

**Fix B — the launch never touches the server.** `handleLaunchRequest` now
returns `serwist.matchPrecache("/loading.html")` **unconditionally** (network
`fetch` only on a precache miss). Because the precache is written at *install*,
this path survives the deploy-time cache wipe that made the old rule inert.
`public/loading.html` paints the branded shell — lifting the splash — then reads
the client-owned `cloudy2.ui` cookie (base64url JSON, same codec as
`decodeUiState`), whitelists `lastPage`, and `location.replace`s to it. So `/`,
a dynamic route whose only job was a cookie read and a 307, is no longer
requested at launch at all.

Two load-bearing details: the redirect is deferred behind **two nested
`requestAnimationFrame`s**, because the parser can reach the script before a
frame has been presented and navigating away pre-paint means the splash never
lifts; and the shell's route whitelist is a duplicate of `BASE_PAGES` /
`SETTINGS_SUBTABS` (now exported) held honest by
`src/lib/pwa/launchShell.test.ts`, which also asserts the double-rAF structure
and that the shell contains no `fetch(`. The whitelist only has to be *safe* —
`requireAdmin()` still guards `/settings/*` server-side.

Removed: `launchDecision`, `LAUNCH_REFRESH_THRESHOLD_MS`, `serveLaunchSkeleton`
and its `window.__C2_LAUNCH__` injection. Kept from that pass:
`isStartUrlRequest`, `lastSavedViewEntry`, and the `serveOfflineDocument`
extraction. `swRules.test.ts` 42 → 40 cases; new `launchShell.test.ts` (5).

Docs: `docs/pwa-offline.md` §1.5.1 rewritten (+ §1.4/§1.9/§1.12/§1.13/§1.15),
`docs/google-integration.md` §1.6, AGENTS.md Google bullet, `progress.md`.
Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (819) + `pnpm build`
(66 precache entries) all pass.

**Still open:** the target navigation after the shell still uses the plain
document SWR route, so a launch can land on a stale-but-stamped page. The agreed
follow-up is a freshness rule there — cached instantly when recent, else
network-first behind the still-painted shell. Neither fix has been measured on
the real device yet; that is the next step.

## 1.153 Document navigations routed by cache age (instant vs fresh)

1.152 made the launch paint instantly, but the page the shell redirects to still
went through an unconditional `StaleWhileRevalidate` — so a launch could land on
a document cached days ago, with only the "Saved · HH:MM" stamp to admit it.
This closes that: the document route now picks its strategy per request, from
how recently the copy was stored.

`handleDocumentRequest` does a **metadata-only peek** — `cache.match(request)`
reading just the `Date` header, no body read, the same technique
`lastSavedViewEntry()` already used — and hands the age to the pure
`isDocumentFresh(savedAtMs, now)`:

- **< `DOCUMENT_FRESH_WINDOW_MS` (5 min)** → `StaleWhileRevalidate`, i.e. exactly
  today's behaviour: instant, revalidated in the background. A render that
  recent cannot have come off a cold stack, so serving it immediately is both
  fast and honest.
- **older / no entry / no usable `Date`** → `NetworkFirst`: fresh content. On a
  launch the precached shell stays painted for the entire wait, because the
  browser holds the current document until the new navigation commits — so the
  sequence reads "skeleton → fresh", never "stale flash".

`null` counts as not fresh (matching `newestSavedView`'s "missing timestamps
sort oldest"), and a future timestamp — server `Date` ahead of the device clock
— clamps to age 0 instead of reading as ancient.

Deliberately **no `networkTimeoutSeconds`**. Serwist supports it, but on a cold
function plus cold Neon the fresh response routinely outlives any sane timeout,
so a timeout would return stale data in precisely the case this rule exists to
fix. Offline safety comes from `NetworkFirst`'s own behaviour instead: it falls
back to `handler.cacheMatch()` when the network *fails* (which still runs the
stamp plugin), and when both are exhausted `Strategy._getResponse` routes
through `handlerDidError` to `serveOfflineDocument` exactly as before.

The two strategies share **one** plugins array. Verified in serwist's source
rather than assumed: `ExpirationPlugin` keys its `CacheExpiration` map by the
`cacheName` passed into each callback, so a single instance manages the one
cache correctly — two instances would double-manage it (duplicate IndexedDB
bookkeeping and redundant deletes). Neither strategy gets
`cacheOkAndOpaquePlugin` auto-prepended, since `documentPlugin` already defines
`cacheWillUpdate`, so storability, session-expiry purging and stamping behave
identically on both paths.

Scope is uniform across all document navigations, not only launches — in an
installed PWA nearly every hard load *is* a launch. The accepted trade-off: a
share link to a >5 min stale page now waits on the network with nothing
painted, where it previously showed stale content instantly.

Also corrected a claim from 1.152: the launch does **not** avoid the server
entirely. `navigationPreload: true` enables preload globally, so the browser
still issues a `GET /` on every launch even though the SW answers from the
precache. It is never awaited and never blocks paint — and it usefully warms the
function and Neon while the shell paints, so the follow-up navigation often
lands on an already-booting instance. The server is off the *critical path*, not
uncontacted.

Verified in the emitted service worker, not just at the source level:
`var ts=5*6e4` with `function ot(e,t){return e===null?!1:Math.max(0,t-e)<ts}`,
one shared plugins array `ht` feeding both `ps=new I({cacheName:R,plugins:ht})`
and `fs=new b({cacheName:R,plugins:ht})`, and the delegation
`async function ms(e){let t=await gs(e.request);return(ot(t,Date.now())?ps:fs).handle(e)}`.

`swRules.test.ts` 40 → 46 cases. Docs: `docs/pwa-offline.md` §1.5 (strategy
selection), §1.5.1 (preload caveat + target hand-off), §1.12/§1.13.
Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (825) + `pnpm build`
(66 precache entries) all pass.

**Still unmeasured on the device.** 1.152 and 1.153 are verified at the build,
bundle and unit level only; the end-to-end splash improvement has not been
timed on the phone. Test protocol: deploy → launch once so the new SW installs
and precaches → background the app → wait >5 min (Neon autosuspend *and* the
serverless instance idling) → launch.

## 1.154 Reverse the banner-reservation decision (no phantom gap while pending)

1.151 reserved the announcement banner's 25px from the shell's first paint
(`bannerActive` defaulted `true`; the `BannerPlaceholder` Suspense fallback was
a 25px spacer) so a configured banner could never shift the header when its
streamed DB read resolved late on a cold start.

In practice that made the **no-banner** cold start (the common case) visibly
double-shift. With the launch shell landing at a 56px navy bar, the redirect to
the app skeleton grew the header to 81px (25px reserved + 56px bar) the moment
the AppShell mounted, then collapsed it back to 56px when `getBanner()`
resolved null — content jumped down, then up. The reservation optimised for the
configured-banner case and penalised the (far more common) absent one.

Change: reverse it. `AppShellShell.bannerActive` now defaults `false`, and
`BannerPlaceholder` renders nothing. The header is the bare 56px brand bar from
first paint, identical to a no-banner layout, so launch shell → app skeleton →
first paint all share one header height, and a null resolve never shifts
anything. When `ShellBanner` resolves present, `BannerLoaded` grows the header
to include the banner in a layout effect (before paint), and the banner still
measures its wrapped height into `--app-banner-height`.

The trade-off, chosen deliberately: a **configured** banner now shifts the
header downward when its read resolves — on cold starts *and* warm loads, since
even a warm request renders the fallback (nothing) before the banner streams in.
This is the opposite of 1.151's guarantee, and exactly what was asked for.

Files: `src/components/AppShellShell.tsx` (state default + comments),
`src/app/(protected)/shellStream.tsx` (`BannerPlaceholder` → null, dropped the
`BANNER_HEIGHT_PX` import), `src/components/ShellChrome.tsx` (`BannerLoaded`
comment). Docs: `docs/announcement-banner.md` §1.3.1 (renamed + rewritten with a
new sequence diagram) and the §1.5 file index; `progress.md` one-liner.
Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` + `pnpm build`.

## 1.155 Single-skeleton launch (unified shell + route skeleton, warm-launch shortcut)

1.152's launch shell (dark, generic month-grid skeleton) composed badly with
1.153's age-routed document navigations: on a launch whose cached document was
older than `DOCUMENT_FRESH_WINDOW_MS` (5 min — nearly every morning launch) the
flow became *launch shell → network-first wait → streamed HTML → `loading.tsx`
Mantine skeleton → data*, i.e. **two visibly different skeletons** before any
content. The `sw.ts` comment claiming "skeleton, then fresh" had missed that
streaming SSR flushes the route fallback as soon as the document commits, while
the dashboard's awaited data (`await fetchMonthEvents`) lands later in the
stream.

Fixed in two layers, keeping both of yesterday's wins (precache-first paint;
fresh data on cold starts):

1. **Pixel-matched skeletons.** `public/loading.html` was rewritten to mirror
   `dashboard/loading.tsx` + `calendarSkeleton.tsx` exactly: all five view
   variants (month / week (H) / week (D) matrix / agenda / schedule) pre-rendered
   and selected via `main[data-view]` from the remembered `dashboard.view`
   (same `cloudy2.ui` codec the shell already decoded), with the same
   deterministic geometry as the app skeletons (chip-count formulas included —
   the month grid is always 42 cells because `MONTH_GRID_WEEKS = 6`). Colors are
   Mantine v9's exact values (light: `#fff` body / `#dee2e6` skeletons /
   `#ced4da` borders; dark: `#242424` / `#424242` / `#424242`), defaulting to
   `prefers-color-scheme` and overridden pre-paint by the manual
   `mantine-color-scheme-value` localStorage choice, matching the app's
   `defaultColorScheme="auto"`. The header is now the real brand bar (56px +
   safe-area, navy `#0D47A1`, `#0a3a85` border, "Cloudy" at size-lg/700 — no
   invented logo), and a mobile bottom-nav placeholder matches
   `AppShell.Footer`. Skeleton cells are stamped out by a synchronous inline
   script (a classic script blocks the parser, so the full skeleton exists
   before first paint — the splash still lifts on the complete skeleton).
2. **Fresh-document shortcut.** `handleLaunchRequest` first calls
   `launchTargetFromCookieHeader(request.headers.get("cookie"))` — the shell's
   decode+whitelist as a pure, unit-tested function in `swRules.ts`
   (`LAUNCH_ROUTE_WHITELIST`). When the remembered page's cached document is
   still fresh (`isDocumentFresh`, the same 5-min window), the launch route
   answers `Response.redirect(target, 302)` and the document route serves the
   cached copy instantly — **warm launches paint the full grid with no skeleton
   at all**. The peek is a local metadata read (no network), and when it misses
   or is stale the flow falls through to the precached shell unchanged, so the
   shell path remains the unconditional cold-start safety net (page caches are
   wiped on activate, making the shortcut inert exactly when the stack is
   coldest — by design).

Known gaps (accepted): a configured announcement banner's height can't be
predicted by the shell (the header grows when it streams in); the desktop
sidebar isn't mirrored (mobile-first; the splash path is mobile-only in
practice); `requireAdmin()` still resolves admin-only targets server-side (a
signed-in non-admin costs one redirect to `/dashboard`, not a login purge).

Files: `public/loading.html` (rewritten), `src/app/sw.ts` (shortcut in
`handleLaunchRequest`), `src/lib/pwa/swRules.ts` (`launchTargetFromCookieHeader`
+ `LAUNCH_ROUTE_WHITELIST`), `src/lib/pwa/swRules.test.ts` (+8 cases),
`src/lib/pwa/launchShell.test.ts` (+3 drift guards: SW whitelist sync, view
variants + default, scheme override). Docs: `docs/pwa-offline.md` §1.5/§1.5.1
(fresh-redirect flowchart + shell-matching prose), §1.12/§1.13/§1.15;
`docs/loading-transitions.md` §1.4; `progress.md` one-liner.
Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (836 passing).

Follow-up fix (same phase): the first cut trapped `VIEW_VALUES` inside the
skeleton-builder IIFE, so the redirect IIFE threw `ReferenceError` on its first
use and aborted `location.replace` — the launch painted the skeleton and never
left it (reported as "the skeleton does not finish loading"). Fixed by hoisting
`VIEW_VALUES` to the script's top level **and** restructuring the redirect IIFE
so the two-rAF `location.replace` is registered before the optional view-variant
tweak (which now runs in its own `try/catch`) — the shell is structurally
guaranteed to navigate. `launchShell.test.ts` gained a **runtime smoke test**
that executes the actual inline script under a `node:vm` DOM shim and asserts
`location.replace` fires (with and without a `cloudy2.ui` cookie, and that a
remembered `dashboard.view` is applied) — verified to fail when the scoping bug
is reintroduced. `pnpm test` 839 passing.

## 1.156 Per-view dashboard filters + one-button filter UI

User feedback on the dashboard's filter surface: the ⋮-menu/modal system felt
complex, most people reach only a couple of filter settings, and users wanted
their filters to be *different per view* sometimes yet *synced* other times.
Shipped in two halves:

1. **One filter button.** The 3-dot kebab lost its entire "Filters" section
   (Myself / Clear / More Filters + badge) — it now holds navigation + refresh
   only. A dedicated `FilterButton` (funnel icon + active-group-count badge,
   optional `size` prop so the Audit Log / Users tables keep the 43px form while
   the nav row uses 36px) opens the same `FilterModal`. The modal keeps
   Calendars (chips) + Users (badge picker with the Myself quick action)
   visible and tucks Event Types behind a per-group "Show"/"Hide" disclosure
   (`collapsedGroupLabels`, opt-in — Audit Log/Users are untouched).
2. **Per-view or synced.** A "Filter scope" control in the modal footer toggles
   between **Same for all views** (default, current behavior, zero change for
   existing cookies) and **Different per view**. Per-view mode gives each of
   Month / Week (H) / Week (D) / Day / Agenda its own absolute Calendars / Users
   / Event Types memory in the cookie:

   - `dashboard.filterMode` = `"per-view"` (absent = `"global"`) + a `views`
     map of fully-resolved per-view sets; `normalizeUiState` keeps **explicit
     empty lists** in per-view sets — a "cleared that filter" state that must
     win over the shared set — and drops the map entirely in a global cookie.
   - `resolveDashboardFilters` (pure, `ui-state.ts`) resolves a key as
     `URL (current view) → views[view][key] → shared set → role default`; on
     `_fresh` renders **only the current view** skips memory (clearing Week
     never wipes Month). `filterMode` is a non-navigating preference read from
     the raw cookie even on `_fresh`, like `pinnedViews`/`zoom`.
   - In per-view mode `switchView` writes the target view's resolved filters
     into the URL (empty selection as `?cal=`, never a removed key) so back/
     forward and the no-`_fresh` rule hold; `usePersistUiState` writes the full
     resolved `views` map back in one section-wholesale replace (and omitting
     it in global mode prunes a stale map on revert). Stale ids are validated
     in `dashboard/page.tsx` exactly like URL params before resolution; an
     all-stale per-view list degrades to "absent" rather than pinning an empty
     grid.
   - Overflow degrade keeps `filterMode` but drops the (largest) per-view id
     lists — per-view memories reset to the shared set, by design.

Files: `src/lib/ui/uiState.ts` (+`resolveFilterMode`, `resolveDashboardFilters`,
`DASHBOARD_VIEW_LABELS`, normalized `views`/`filterMode`), `uiState.test.ts`
(+14 cases, 851 total), `uiStateClient.ts` (overflow keeps `filterMode`),
`src/app/(protected)/dashboard/page.tsx` (per-view resolution + validation +
props), `DashboardView.tsx` (props, mode state + render-phase sync, switchView
filter writes, persist, kebab trim, FilterButton placement, modal scope/hint),
`src/components/FilterModal.tsx` (collapsible groups, hint, modeControl),
`src/components/FilterButton.tsx` (size prop). Docs: `docs/ui-state.md`
(§1.4/§1.4.1/§1.4.2 shape+normalize, §1.5.1 resolution + mermaid, §1.7, §1.9
`_fresh` scoping), `docs/dashboard-views.md` (§1.2 rewritten + mermaid),
`progress.md` one-liner.
Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (851 passing) +
`pnpm build` clean. Outside scope: Parade State still has its own page-level
filters (already separate from the dashboard); named saved presets remain a
possible future layer over the same `views` state.

## 1.157 Reset/Clear reverted by the stale `_fresh` strip (bugfix)

Report: in per-view mode the filter dialog's Reset "does nothing" — the filters
stay after Reset + Apply. Root cause was NOT the per-view resolution logic
(which resolved correctly); it was the `_fresh` one-shot marker's strip:

1. Reset + Apply navigates with all three filter params removed → `?_fresh=1` →
   the server re-renders with role defaults (filters cleared) and
   `usePersistUiState` persists the cleared state to the cookie.
2. The self-terminating `_fresh` strip then did a **plain `router.push`** back to
   the bare URL. With `experimental.staleTimes.dynamic: 120` and the SW's
   `app-rsc-swr` cache, that soft navigation is answered by the **stale
   client-router RSC snapshot saved earlier in the session** — which still
   carries the old filters — so the grid reverted instantly and
   `usePersistUiState` **re-seeded the just-cleared memory** with the old values
   (per-view: `views.<view>`; global: top-level `cal/users/types`), making the
   reset permanent even across reloads. The `?refresh=` strip already documented
   this exact trap ("a plain `router.push` here re-served the pre-edit snapshot
   and reverted the edit") and worked around it with `router.refresh()`.

Fix: the `_fresh` strip in `DashboardView.tsx` and `ParadeStateView.tsx` now
mirrors the `?refresh=` strip — `router.replace(buildHref({ _fresh: null }), {
scroll: false }); router.refresh()` — so the bare URL is re-served from the
server (bypassing the stale cache) and the freshly-persisted values stay on
screen. Self-terminating (the param is gone → the effect won't re-run), no
skeleton/fade (refresh isn't a transition). The `?edit=`/`?event=` strips stay
plain pushes: they carry no filter state to resurrect.

Files: `src/app/(protected)/dashboard/DashboardView.tsx`,
`src/app/(protected)/parade-state/ParadeStateView.tsx` (both `_fresh` strips).
Docs: `docs/loading-transitions.md` §1.7 (strip table + mermaid),
`docs/ui-state.md` §1.9 (strip step + sequence diagram + why replace+refresh),
`progress.md` one-liner.
Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; manual QA on
the per-view Reset flow (grid clears, stays after the strip, survives reload,
other views untouched).

## 1.158 Per-view filters silently wiped by the overflow drain; cookie versioning (bugfix)

Report: the Users filter "sometimes doesn't apply" — in per-view mode, applying
A+B on view 1, switching to a no-filter view 2 and back, the filter is gone;
an F5 does NOT restore it. Users specifically; both anchored⇄anchored and
Month-involved switches; both filter scopes. Root cause (confirmed by the
>150-roster size math): `usePersistUiState` persisted the FULL resolved
`views` map (`views: viewFilters`), so every render materialized
`cal = <all 15+ calendars>` into all five views. Adding the several shared
lists pushed the encoded cookie past `SAFE_COOKIE_VALUE_LENGTH` (3500), and
`writeUiState`'s all-or-nothing overflow guard dropped BOTH the shared id
lists AND the entire `views` map — permanently, for every subsequent write.
Users is the only filter whose loss was visible (Calendars reverting to the
admin all-default is invisible), which matched the report exactly.

Fixes:
1. **Writer never materializes unconfigured views.** New pure
   `buildDashboardPersist(prev, seed)` + `DashboardPersistSeed`: the persisted
   `views` = the previous map MERGED with only the current view's entry; a key
   is recorded when the URL pins it (an apply / per-view view-switch wrote it),
   or when the view already remembered it, otherwise it stays ABSENT and falls
   through to the shared set. `DashboardView` now passes a seed
   (view/date/month/selected/pinned/zoom/filterMode/urlKeys); `usePersistUiState`
   builds the section from the CURRENT cookie at effect time. Explicit clears
   (empty) are still recorded for views that previously remembered the key.
2. **Overflow guard trims instead of nuking.** New pure
   `reduceUiStateForCookie` drops the least-intentful largest list per pass:
   parade → shared → per-view cal → per-view types → per-view users last
   (never silently wiping `views`); `writeUiState` loops it under the limit.
3. **Cookie schema versioning `[major, minor]`.** `encodeUiState` stamps
   `{ v: [2, 0], ...state }`; `decodeUiState` drops the whole cookie on a
   major mismatch in either direction (also rollback-proof), decodes a newer
   minor as-is, runs the `MINOR_MIGRATIONS` chain for older minors, and drops
   legacy v1 cookies entirely — every existing (drained/materialized) cookie
   gets a clean start. This ship is the v2 major bump the user requested
   ("insert cookie, start clean").

Tests: version drop/migrate/forward-compat, `buildDashboardPersist` semantics
(no materialization, explicit-clear kept, other views preserved, global prune),
`reduceUiStateForCookie` tiering/pruning/non-mutation. Docs: `ui-state.md`
§1.4 (versioning + overflow), §1.5.1 (config-only writer), §1.7 (seed row +
guard); `dashboard-views.md` §1.2. Verification: lint/typecheck/871 tests/build.
No DB/migration impact — cookie-only.

## 1.159 Per-view filters leaked into untouched views via the moving shared set (bugfix)

Report: with "Different per view" selected, configuring View 1 (e.g. Users
A+B) made every untouched view show the same filters — per-view behaved like
global. Root cause: per-view resolution still fell back `views[view] → SHARED
set → role default`, and the shared set (`dashboard.cal/users/types`) was
overwritten with the current view's selection on every render. So configuring
View 1 wrote `views.view1` AND the shared set, and an untouched View 2 (no
memory) inherited that shared set — including via `switchView`, whose
`viewFilterParams` copied the shared-derived resolved set into the target's
URL. v2's working memory made the leak visible (pre-v2 the overflow drain
wiped everything, which is why the earlier report was "Users resets").

Fix (chosen: role defaults for untouched views): per-view mode ignores the
shared set entirely. `resolveDashboardFilters` gained `perView?: boolean`;
when set, "other view" and current-view fallback become `views[view] → role
default` (URL-wins and `_fresh` rules unchanged). The page passes
`perView: filterMode === "per-view"`. The shared set remains the global-mode
set and the "flip back to Same for all views" collapse target. Cleared views
resolve to role defaults with nothing to resurrect; explicit-empty per-view
lists still resolve empty.

Files: `src/lib/ui/uiState.ts` (`DashboardFiltersResolution.perView`,
`resolveDashboardFilters`), `src/app/(protected)/dashboard/page.tsx`,
`src/lib/ui/uiState.test.ts` (per-view tests now assert shared-independent
resolution). Docs: `docs/ui-state.md` §1.5.1 (resolution orders + mermaid +
writer/stale bullets), §1.4.1, §1.7; `docs/dashboard-views.md` §1.2.
Verification: lint/typecheck/871 tests/build; manual: per-view, filter View 1
to A+B, leave View 2 untouched → View 2 shows no user filter; A+B stays only
on View 1 across switch⇄ and F5.

## 1.160 External-event highlight across all dashboard views (purple)

External events (created directly in Google Calendar — no `Created in cloudy2`
marker and no notes block, so `isExternalEvent`/`payload.external === true` at
read time) get a **purple** per-view highlight, in parallel with the amber
"mine" treatment from §1.144/§1.145. An external event can never be *mine*
(it has no recorded creator), so the two highlight classes never collide on one
event. The treatment is purely additive (ring / bar / tint) — event body colors
are untouched, so untyped events keep their department-calendar color.

Per-view mechanics (all client-side, same `renderEvent` / render-hook pattern as
§1.144 — no cache or server impact):

- **Month** — `renderMyMonthEvent` also adds `c2-ext-event`; globals.css outlines
  the inner chip element (the child carrying the rounded background, exactly like
  the amber `c2-my-event` ring), including the "+N more" popup copies.
- **Agenda** (tab + month day modal) — `renderMyAgendaEvent` adds
  `c2-ext-agenda-event` to external rows: purple left bar + tint + semibold
  title, chronological order kept.
- **Day / Week (H)** — a shared `renderScheduleEvent` hook (new on Week (H);
  Day folds it into its existing all-day sticky-title hook) appends
  `c2-ext-slot-event` to the event root for external events. The root's single
  child is the chip in every shape (the ScheduleEvent inner box for timed events
  and Week (H) all-day bars; Day's custom all-day Box), so one `> *` outline
  rule covers all of them.
- **Week (D)** — the matrix banner's inner Box carries the rounded background (and
  the event's 1px border) itself, so it gets the self-ring class `c2-ext-ring`
  instead of the `> *` variant.

Color: Mantine's built-in `purple` family — deliberately distinct from the brand
amber (`accent`, mine), brand blue (`brand`, today/primary) and red (errors / KAH
warnings). `purple-6` holds on both light and dark bodies for the ring and bar;
the agenda tint switches on color scheme via a new `--c2-ext-row-tint` custom
property (light: near-white `purple-0`; dark: deep purple `#241a45`, mirroring the
mine row's olive-dark pattern), defined next to `--c2-my-*` in `globals.css`.

Files: `src/app/globals.css` (the `--c2-ext-row-tint` property + `c2-ext-event` /
`c2-ext-slot-event` / `c2-ext-ring` / `c2-ext-agenda-event` rules),
`src/app/(protected)/dashboard/DashboardView.tsx`
(`isExternalRenderEvent` helper; external classes in `renderMyMonthEvent` /
`renderMyAgendaEvent`; new `renderScheduleEvent`; Day all-day hook merged with
`extClass`; Week (H) gains `renderEvent={renderScheduleEvent}`), and
`src/app/(protected)/dashboard/WeekMatrixView.tsx` (`c2-ext-ring` on the banner
Box).

Docs: `docs/dashboard-views.md` gains §1.6 External-event highlight (mechanics +
colors + mermaid); prior §1.6 Timeline zoom / §1.7 File index renumber to §1.7 /
§1.8, and the three stale `#15-timeline-zoom-day-and-week-h` cross-refs in
`desktop-responsive.md` / `grid-pan.md` are corrected to the new §1.7 anchor.
AGENTS.md dashboard bullet notes the per-view mine/external highlight.

Verification: lint/typecheck/872 tests/build. Manual: with an external
(Google-created) event in a shared month — purple ring on its chip in Month
(incl. "+N more"), on its Day/Week (H) block and Week (D) banner; purple
bar/tint/bold in the Agenda tab and the month day modal; amber "mine" treatment
and event body colors unaffected in light and dark.

## 1.164 Event type groups (categories in the event wizard's type step)

Users reported the event wizard's flat, alphabetical list of event types was
overwhelming, and asked for the types to display in categories. Admins can now
create **event type groups** and assign each type to one; the wizard's type step
renders one labeled section per group.

Schema (migration `0031_bouncy_queen_noir`): a new `event_type_groups` table
(`id`, `name` unique, `sort_order`, timestamps) and `event_types.group_id` — a
nullable FK with `ON DELETE SET NULL` (the `calendars.parent_id` pattern), so
deleting a group never deletes a type: its types simply become ungrouped.

Picker: the dashboard page fetches groups in the same `Promise.all` as the
types (`listEventTypeGroups()`, per-request React-cached like
`listEventTypes`) and passes them through `DashboardView` to `EventForm`,
which renders sections via the pure `buildEventTypePickerSections(types,
groups)` (`src/lib/eventTypes/groups.ts`, unit-tested in `groups.test.ts`):
groups in display order (`sort_order`, name tiebreak), types within a group
alphabetical, empty groups skipped, and a trailing "Ungrouped" section
(`UNGROUPED_LABEL`) only when some type has no group (mirroring "No department"
last in the user picker). A type whose `group_id` doesn't resolve degrades to
ungrouped rather than disappearing. Grouping is presentation-only — the
`eventType` name in the notes block, target derivation, KAH checks, and colors
are all untouched.

Admin UI: Settings → Event Types gains a **Manage groups** button (toolbar at
lg, second FAB on mobile) opening `EventTypeGroupsModal` — create (name,
appends after the last group), inline rename (check/cancel row), delete (the
confirm states how many types become ungrouped), and up/down reordering.
`sort_order` moves re-rank the whole list (position = rank), closing gaps —
the same convention as `moveDepartment` (`moveEventTypeGroupOrder`, pure).
The event type form gains a Group `NoKeyboardSelect` (the "Ungrouped" option
stores `null`; `createEventType`/`renameEventType` verify the id exists before
writing and record the group label in the audit details/diff), and the event
type table shows a Group column (desktop) / badge (mobile). All four group
mutations are `requireAdmin()` server actions in
`src/lib/eventTypes/groupActions.ts` with audit rows
(`eventTypeGroup.create` / `eventTypeGroup.update` / `eventTypeGroup.delete`;
moves log as `update` with an `order` diff).

Docs: `docs/event-lifecycle.md` gains §1.10 Event type groups (schema, order
rules, management, mermaid data-flow); §1.10/1.11/1.12 renumber to
§1.11/1.12/1.13 (cross-refs in this file and `event-mutations.md` updated);
`admin-guide.md` §1.4 and `user-guide.md` §1.4.1 note the categories.

Verification: lint/typecheck/891 tests (incl. 10 new groups cases)/build.
Manual: create two groups + assign types, verify wizard sections in the admin
order with ungrouped last; reorder groups (up/down, rank re-gap-closing),
rename, delete (types ungroup in the wizard), and the event type form's Group
select round-trips (including back to Ungrouped).

## 1.167 PWA launch regression: cached-first documents + unconditional launch shell

Reported as "the splash screen stays up for a long time until all content is
loaded" — i.e. the 1.152–1.155 launch work had stopped holding up its end, and
on the device the symptom was the *plain navy manifest splash*, not the launch
shell: nothing was painting at all during the wait.

Two defects from that burst composed into it:

1. **The cache-age rule (1.153) made stale documents blocking.**
   `handleDocumentRequest` peeked at the stored entry's `Date` and sent anything
   older than `DOCUMENT_FRESH_WINDOW_MS` (5 min) to `NetworkFirst`. For an app
   reopened after a coffee break that is *every* launch, so the launch was back
   to waiting out a cold function + cold Neon before committing — the exact
   opposite of §1.2's "cold PWA open shows the last-saved calendar instantly".
2. **The fresh-document shortcut (1.155) could never fire — and when it did, it
   was the branch with nothing painted.** It resolved the remembered page from
   `request.headers.get("cookie")`, but `Cookie` is a **forbidden request
   header**: the Fetch standard appends it in the network & cache layer
   (§4.6 step 21), *after* service-worker interception, so a SW's `Request`
   never carries it. Wherever a browser does leak it, the route answered
   `Response.redirect(target, 302)` — skipping the shell for a second navigation
   which, if its own cache peek disagreed, went to the network with the splash
   as the only thing on screen.

A third, latent one: `isStartUrlRequest` demanded `/` with **no query at all**,
so any param a launcher tags onto the start URL (`?utm_source=homescreen`)
dropped the launch out of the launch route and into the blocking document route
with no error anywhere.

Fix, in the order the launch now runs:

- **`handleLaunchRequest` is unconditional**: precached `/loading.html`, network
  only on a precache miss, and **no redirect, ever**. Documented as a rule in
  `sw.ts` and in `docs/pwa-offline.md` §1.5.1 — on a cold launch the shell is
  the only thing that can guarantee a paint, so it is always the answer.
  `launchTargetFromCookieHeader` + `LAUNCH_ROUTE_WHITELIST` deleted from
  `swRules.ts` (the shell's own client-side `document.cookie` decode still
  works — the cookie is not HttpOnly — and it remains the single resolver of the
  launch target).
- **`isStartUrlRequest` is lenient**: `/` plus any `utm_*` params counts, hash
  ignored; a non-tracking param still falls through to the document route (a
  real deep link, not a launch).
- **`handleDocumentRequest` is gone**: the document route is plain
  `StaleWhileRevalidate`, serving a cached copy at any age. `NetworkFirst` is no
  longer imported.
- **Staleness moved to after paint.** `needsReconcile(cachedAtIso, now)` (pure)
  reads the SW's `__C2_STAMP__` document stamp — *absent* means the document came
  off the network, so no pointless refresh — and `useStaleDocumentReconcile`
  (mounted in `AppProviders`, once per document load) waits 1.5 s, then runs one
  `router.refresh()`. It clears **RSC entries only** via the new
  `invalidateRscPathCaches`: deleting the cached *document* would destroy the
  very entry that makes the next launch instant (the SW's background
  revalidation already keeps it current). This is the one deliberate exception to
  the invalidate-before-every-refresh rule, called out in `AGENTS.md`,
  `docs/pwa-offline.md` §1.7, and the code comment.
- The reconcile dispatches `cloudy2:document-reconciled`, which `DashboardView`
  listens for to mark the data fresh exactly as a force-refresh does;
  `initialSavedAt()` now reads the stamp through the shared
  `documentCachedAtIso()` instead of poking `window.__C2_STAMP__` itself.
- `invalidatePathCaches` was refactored so the document and RSC variants share
  `deletePathEntries` (no duplicated key filtering).

Net launch: tap → precached shell paints (splash lifts) → cookie-resolved target
→ cached document served instantly → after-paint reconcile upgrades the view.
The "warm launch skips the skeleton entirely" nicety that the deleted shortcut
was meant to serve is *not* restored — the user chose to see how the unconditional
shell reads first; the follow-up candidate is a shell-side `caches.match()` of the
target document (Cache Storage is available to pages, unlike the SW's cookie
problem) instead of anything cookie-based.

Files: `src/app/sw.ts` (launch route, document route, comment rewrite),
`src/lib/pwa/swRules.ts` (`isStartUrlRequest`, `needsReconcile`; shortcut
helpers deleted), `src/lib/pwa/client.ts` (`invalidateRscPathCaches`,
`documentCachedAtIso`, `useStaleDocumentReconcile`, `DOCUMENT_RECONCILED_EVENT`),
`src/components/AppProviders.tsx` (hook mounted),
`src/app/(protected)/dashboard/DashboardView.tsx` (reconcile listener + shared
stamp reader), `public/loading.html` (comments: no SW 302, shell is always the
answer).

Tests: `swRules.test.ts` — `isStartUrlRequest` rewritten for the lenient rule
(utm accepted, other params rejected, hash ignored), new `needsReconcile` block
(5 cases), cookie-decode block removed (52 cases); `launchShell.test.ts` — the
SW-whitelist sync guard is replaced by a **static guard on `src/app/sw.ts`**
asserting the launch route answers from the precache and contains no
`Response.redirect` and no cookie peek, and the DOM shim now feeds the shell its
*own* parsed route list instead of the deleted constant (11 cases).

Docs: `docs/pwa-offline.md` §1.4 (route list), §1.5 (cached-first + revert
rationale, stamping feeds the reconcile), §1.5.1 (unconditional shell, the
forbidden-`Cookie` explanation, lenient matcher, new flowchart, three
load-bearing properties), §1.7 (the RSC-only exception), §1.11, §1.12, §1.13,
§1.15; `docs/ui-state.md` (the cookie is decoded in the page, never by the SW);
`AGENTS.md` PWA bullet.

Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (889 passing) +
`pnpm build` (precache still carries `/loading.html` + `/offline.html`).
Manual (device, needs the user): cold launch offline → **the branded skeleton
must paint** (if the plain navy splash still sits, the SW is not answering `/`
at all — check `chrome://inspect` / `chrome://serviceworker-internals` for the
controlling SW and the launch request); cold launch online → skeleton → cached
grid → view updates ~1.5 s later without a spinner; F5; force-refresh; a
`?utm_source=homescreen` start URL; sign-out isolation; deploy takeover.

## 1.169 Notes "Edit:" link opens the event details modal (legacy `?edit=` kept)

The notes `Edit: <url>` line on Google Calendar events deep-linked the *edit form*
directly (`/dashboard?date=…&edit=<group id>`, `eventEditUrl`). It now deep-links the
**event details modal** (`?date=…&event=<group id>&_eventCal=<calendar id>`,
`eventDetailUrl`) — the same `?event=` machinery the search modal and Pinned Events
taps already use — so a tap from Google lands on the shared `EventDetail`
(Duplicate / Edit / Delete), with the visible label intentionally unchanged. Each
copy's link carries its own calendar id as `_eventCal`, so the dashboard's fetch
includes that calendar even when the arriving user's filters exclude it (added to
the fetch set only, never the filter selection) — mirroring the search/Pinned links.

Because the link is only rebuilt on the event's next create/edit, **old events keep
their `&edit=` URLs** — so the `?edit=` deep link (server resolve in `page.tsx`,
mount-time `formState` open + one-shot strip in `DashboardView`) stays fully
supported as a legacy path (and serves the search modal's "Edit" action); nothing
new writes it anymore.

`event` joins `swRules.ts` `ONE_SHOT_PARAMS` (`refresh`/`edit`/`_fresh` →
`refresh`/`edit`/`event`/`_fresh`): the client strips the param right after its
render, so a stored `?event=` document/RSC entry would only be pollution the
offline "last saved view" redirect could mis-pick. (This also closes a pre-existing
gap — search/Pinned `?event=` deep links were previously being stored.)

Files: `src/lib/events/notes.ts` (`eventEditUrl` → `eventDetailUrl`, `edit` →
`event` param, + `calendarId` → `_eventCal`), `src/lib/events/actions.ts`
(`buildGcalEventInput` gains the copy's app calendar id + comment),
`src/app/(protected)/dashboard/page.tsx` + `DashboardView.tsx` (comment updates
only — behavior unchanged), `src/lib/pwa/swRules.ts` (+1 one-shot param).

Tests: `notes.test.ts` (renamed describe, `&event=…&_eventCal=…` expectations,
fixtures), `eventAudit.test.ts` (v3 fixture URL), `swRules.test.ts` (one-shot loops
now cover `event=`).

Docs: `docs/event-lifecycle.md` §1.4.2 (rewritten: `?event=` details link + legacy
`?edit=`) and §1.7.3 (`eventDetailUrl`), §1.13 file index;
`docs/loading-transitions.md` §1.7 gains a `?event=` row (the table previously
listed only 3 of the 4 one-shot params); `docs/ui-state.md`, `docs/pwa-offline.md`,
`docs/event-search.md` (cross-ref: the notes link is another `?event=` producer),
`AGENTS.md` (notes + ui-state bullets).

Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (890 passing). Manual
(needs the user): create an event in dev → its Google notes link reads
`&event=…&_eventCal=…` → tap → the details modal opens (not the form); tap a
pre-change event's `&edit=` link → the edit form still opens.

## 1.170 Pinned-events header ticker (rotating titles + inline count + `pinnedHeader` template target)

The static "Pinned events" header button became a **ticker** and moved to the
header's left edge — the "Cloudy" wordmark was removed entirely. The pill keeps
its rounded-rectangle shape and pin icon, and now displays, left to right: the
pin icon, an **inline amber `1/N` count chip** (position within the rotation +
total pinned; replaces the floating `Indicator` badge, which is deleted), and
the **current pinned event's title**, rotating every **5s** with a vertical
ticker slide (outgoing slides up/out, incoming slides up/in, ~320ms,
`c2-ticker-in`/`c2-ticker-out` in `globals.css` under the app's
`prefers-reduced-motion` guard).

Rotation pauses while the pill is hovered or focused, while the tab is hidden,
and while the panel modal is open (`paused` prop); a single pinned event never
rotates; the index clamps modulo when the list changes. Loading / zero events
degrades to the static icon + "Pinned events" label. The title viewport has a
**fixed flex-basis** (~9rem phones, ~17rem from the 40em band) — the pill is
shrink-to-fit and the sliding lines are absolutely positioned, so a `flex: 1`
(0%-basis) viewport contributes nothing to the pill's intrinsic width and
renders blank; the fixed basis keeps the pill's width stable across rotations,
with `flex-shrink` letting very narrow headers squeeze it. A CSS `max-width`
caps the pill (~220px phones, ~400px desktop) as the wide-screen safety net.
The ≤360px compact tier keeps the pill now that the logo is gone (the old
icon-only `ActionIcon` fallback is deleted).

**Data:** the shell switched from `countPinnedEvents()` (deleted — its
`PINNED_COUNT_KEY` cache key with it) to `fetchPinnedEvents()` on the same
mount/panel-close/refocus/`PINNED_EVENTS_CHANGED_EVENT` triggers, deriving the
count from the list length. The zero-event case stays cheap: the list read
early-returns before resolving users/types.

**Templates:** `fetchPinnedEvents` now renders every event twice — `title`
through the existing `pinned` target (panel list) and the new `tickerTitle`
through the new **`pinnedHeader`** target. `pinnedHeader` joins
`EVENT_TITLE_ASSIGNMENT_TARGETS` (no migration — whitelisted jsonb); the
Settings → Templates → View assignments modal gains its row automatically (the
modal iterates the targets), labeled "Pinned events (header)" while the panel
target was renamed "Pinned events (panel)" to disambiguate. Unassigned =
Master, like every other target.

**A11y:** the count rides the button's `aria-label` (`"Pinned events (5)"`);
the chip and the rotating titles are `aria-hidden` so the number is read once
and the 5s rotation never spams screen readers (the panel stays the accessible
list). The pill is an `UnstyledButton` + `.c2-pinned-ticker` CSS (Mantine's
`Button` label won't shrink/truncate inside a max-width — verified against v9's
hashed CSS), with a `:focus-visible` amber outline.

Files: `src/components/PinnedEventsTicker.tsx` (new),
`src/components/AppShellShell.tsx` (logo/Indicator/button removed; ticker
wired), `src/lib/events/pinned.ts` (`tickerTitle`, `countPinnedEvents`
deleted), `src/app/globals.css` (pill/chip/title/keyframes),
`src/lib/settings/validate.ts` + `validate.test.ts` (target + labels),
`TemplatesForm.tsx` (form key + copy).

Docs: `docs/pinned-events.md` §1.4 rewritten (ticker), §1.2/§1.5/§1.6 updated;
`docs/event-lifecycle.md` §1.8.5; `AGENTS.md` (pinned/templates/compact-tier
bullets); `docs/user-guide.md` §1.5; `docs/desktop-responsive.md` §1.2/§1.10;
`docs/accessibility.md` §1.4/§1.5; `docs/events-cache.md` §1.12/§1.13;
`docs/neon-usage.md` §1.5.

Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` (890 passing,
incl. the updated assignment-target expectations). Manual (needs the user):
pin 2+ events → the pill rotates titles every 5s with the `1/N` chip counting
along; hover pauses it; assign a template to "Pinned events (header)" in
Settings → Templates → Manage assignments and the ticker re-renders through it
while the panel keeps its own.

## 1.171 `db:seed` no longer seeds departments or users

The dev seed previously inserted four `calendars` rows (the department registry) with
fabricated Google ids (`dept-operations@cloudy.local`, etc.) plus users assigned to
them. A department row is only valid when its `google_calendar_id` mirrors a **real**
Google calendar created through the app — `createDepartment` calls
`integration.createCalendar(name)` first and stores the returned id
(`src/lib/roster/actions.ts`). A DB-only seed cannot create those calendars, so the
fabricated rows broke any environment attached to a configured service account:

- Dashboard default fetch = all calendars for admins, own department for users
  (`dashboard/page.tsx`), so the first month view issued Google `events.list` on a
  nonexistent id → 404 → `fail()` throws "Calendar not found in Google Calendar"
  (`src/lib/google/real.ts`) and the events cache propagates rather than serving data
  (`src/lib/google/eventsCache.ts`).
- Parade state, KAH status, event search, department rename/delete, and user access
  reconciliation (`src/lib/roster/shares.ts`) all call Google with the same fake ids.

This was already worked around organizationally in §1.140 (dev DBs migrations-only,
`db:seed` skipped); this phase makes the seed itself safe to run.

**Change:** `src/db/seed.ts` now only seeds DB defaults with no Google coupling — it
ensures the settings singleton exists and defaults `userKeyword = 'leave'` when empty.
When inserting the singleton on a fresh (never-authenticated) database it mirrors
`ensureSettingsRow` by hashing `ADMIN_INITIAL_PASSWORD` if present, so admin-password
login still bootstraps. Departments and users are created in-app on a migrations-only
DB (`createDepartment` makes real calendars under the environment's service account).

Docs/commands updated to say departments/users are created in-app only: `AGENTS.md`
(seed command comment), `docs/developer-guide.md` §1.2/§1.3/§1.9 warning, `progress.md`.

Verification: `pnpm lint` + `pnpm typecheck` + `pnpm test` + `pnpm build`. No schema
change — no `db:generate`/migration. (Optional manual: run `pnpm db:seed` against a
local `.env.local` DB twice — second run reports nothing new.)
