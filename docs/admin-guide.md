# 1. Admin guide

Everything an administrator does in Cloudy: signing in as admin, acting on behalf of
other users, and the ten Settings tabs. Everyday usage is covered in
[`user-guide.md`](user-guide.md); implementation detail lives in the linked
deep-dive docs.

## Table of contents

- [1.1 Admin sign-in & acting on behalf](#11-admin-sign-in--acting-on-behalf)
- [1.2 Users](#12-users)
- [1.3 Departments](#13-departments)
- [1.4 Event Types](#14-event-types)
- [1.5 Templates](#15-templates)
- [1.6 Webhooks](#16-webhooks)
- [1.7 Quick Links](#17-quick-links)
- [1.8 KAH Groups](#18-kah-groups)
- [1.9 Banner](#19-banner)
- [1.10 General](#110-general)
- [1.11 Audit Log](#111-audit-log)

## 1.1 Admin sign-in & acting on behalf

- Sign in with the **admin password** (single input, same field everyone uses).
  The initial password comes from `ADMIN_INITIAL_PASSWORD`, seeded on first login.
- Admins can see and edit **every** event in every department — including
  **External** events created directly in Google Calendar.
- In the event wizard, admins get an extra **Creator** step ("On behalf of") to
  create an event as another user; that user becomes the event's owner.
- Settings is admin-only: ten tabs under `/settings`
  (Users, Departments, Event Types, Templates, Webhooks, Quick Links, KAH Groups,
  Banner, General, Audit Log). Every settings mutation is audit-logged.

## 1.2 Users

Settings → Users (`/settings/users`). One row per person:

- **Fields:** Name, Shortname, Phone, Email (optional), Birthday, Department,
  Role (**User** / **Admin**), Status (Active / Inactive).
- Phone and shortname are unique — duplicates are rejected with a field error.
- A user belongs to **exactly one department**; the Department field is a row of
  toggleable badges. Inactive users drop out of pickers and KAH headcounts but
  keep their history.
- Email matters: KAH breach notifications go to the members' email addresses
  (§1.8) — members without an email can't be notified.

Design: [`roster-sharing.md`](roster-sharing.md).

## 1.3 Departments

Settings → Departments. Each department is a **Google Calendar** owned by the
service account; creating one creates the calendar and shares it.

- **Detail modal** (tap a row/card): rename, color, parent, calendar access, and
  delete in one place.
- **Hierarchy:** departments nest via the Parent select (self and own descendants
  are excluded; cycles are rejected server-side). The list shows tree order with
  sibling-scoped up/down moves; deleting a parent promotes its children to top
  level and unassigns its users. Parade state and the attendance report aggregate
  down the subtree.
- **Color:** optional; used only as the fallback color for untyped/external events.
  Event colors are applied at read time — changing one never needs cache
  invalidation.
- **Calendar access:** assigned users get an inline role selector — **Read only** /
  **Can edit** / **Owner** — applied to Google immediately and kept in sync by
  reconcile on read/write (email changes re-sync automatically).

Design: [`roster-sharing.md`](roster-sharing.md).

## 1.4 Event Types

Settings → Event Types. Each type constrains the event wizard:

- **Groups** — **Manage groups** (toolbar button, second FAB on mobile) opens a
  dialog to create, rename, delete, and reorder the display categories the event
  wizard groups types under. Each type's form has a **Group** select; types
  without a group appear in the wizard's trailing "Ungrouped" section. Deleting a
  group never deletes a type — its types just become ungrouped. Groups are
  presentation-only: colors, target derivation, and KAH are unaffected.
- **Name + Shortname** — the shortname is the `{type:acronym}` title token; it must
  be unique.
- **Time options** — which duration styles the type allows (e.g. range times,
  full/half day).
- **Allowed locations matrix** — which categories events of this type may use:
  **In camp**, **Out of camp**, **Overseas**. Enforced client- and server-side; an
  out-of-policy pick degrades to the first allowed category. Overseas is the KAH
  "away" signal.
- **Show Remarks** — off hides the Remarks step and clears the description.
- **Show Invitees** — off hides the Invited Attendees step and collapses attendees
  to the creator (re-saving such an event removes its other departments' copies).
- **Color** — optional Mantine palette color for the type's events (null = a
  deterministic default derived from the type name).

Design: [`event-lifecycle.md`](event-lifecycle.md) §1.9, §1.10.

## 1.5 Templates

Settings → Templates. Two template families plus a library:

- **Display-name template** — `{name}` / `{department}` tokens; used everywhere a
  person's name renders (titles, KAH emails, contacts export).
- **Event title template** — tokens: `{description}`, `{type}`, `{type:acronym}`,
  `{departments}`, `{location}`, `{people}` / `{people:full|acronym|fqn}`.
  Wrap punctuation in `< >` conditional groups to hide it when every token inside
  is empty (e.g. `{description}< - {location}>`). Unknown tokens stay literal.
- **Library templates + View assignments** — save named templates, then assign one
  per display target: the five dashboard views plus **Pinned events**. Unassigned
  targets fall back to the Master template. Assignments change how titles *display*
  in the app; the Google summary is always written with the master-rendered title.

Design: [`event-lifecycle.md`](event-lifecycle.md) §1.8.

## 1.6 Webhooks

Settings → Webhooks — notify external systems after every event create/update/delete.

- **Endpoint fields:** Name, URL, optional **signing secret**, Enabled switch.
  Every enabled endpoint receives every action.
- **Delivery:** fire-and-forget POST right after the mutation commits — it never
  delays or fails the mutation, and there is no retry queue.
- **Signature:** when an endpoint has a secret, deliveries carry
  `X-Cloudy2-Signature: sha256=<hex>` — HMAC-SHA256 of `"<timestamp>.<body>"` keyed
  by the secret.
- **Payload reference:** the tab's accordion shows example payloads generated from
  the real builder — never hand-copy JSON into that UI. Updates include `changes`
  `[before, after]` pairs; payloads mirror the audit snapshots.

Design: [`webhooks.md`](webhooks.md).

## 1.7 Quick Links

Settings → Quick Links — shortcut links on the Calendar page.

- **Fields:** Label, URL (**http/https only**), icon (curated icon picker), color,
  Enabled. Reorder with up/down moves.
- The launcher — an amber link button beside **+** on mobile, a "Quick links" chip
  at `lg` — renders only while at least one link is enabled, and always opens the
  menu (items open in new tabs).

Design: [`quick-links.md`](quick-links.md).

## 1.8 KAH Groups

Settings → KAH Groups — Key Appointment Holder constraints are **notify-only**: the
app never blocks an event.

- **Groups:** Name, **Required in-country %** (prefilled from the General-tab
  default), and Members picked through the badge dialog (active users grouped by
  department).
- **Breach check:** after every successful event create/update (never delete), the
  app month-reads all calendars through the cache and marks members **away** when
  they're tagged on an **Overseas** event overlapping the new event's window. A
  group whose floored in-country % drops strictly below its requirement triggers:
  1. an audited `kah.breachNotify` row (always), and
  2. **one combined email** to the breached groups' members (their `users.email`),
     if any resolve and an email transport is configured.
- **Email transports (first configured wins):** Workspace delegation
  (`GOOGLE_DELEGATE_EMAIL` + `gmail.send` scope) → SMTP (`SMTP_URL`) → audit-only.
- **Breach Email Templates** (same tab): admin-editable subject/body with live
  preview; tokens `{event}` `{actor}` `{window}` `{breaches}`. The body must keep
  `{breaches}`.
- Members also get the read-only **KAH Status** page automatically; **admins always
  see it too**, listing every group's breach periods (past & next 3 months,
  resolved/active/upcoming).

Design: [`kah.md`](kah.md).

## 1.9 Banner

Settings → Banner — a persistent announcement above the header for all signed-in
users.

- **Enable switch + text** (max 200 characters; text wraps and the banner grows).
- **Color:** curated swatches only (Navy, Amber, Red, Green, Orange, Violet, Cyan);
  each swatch pins its readable text color.
- The layout follows the banner automatically — no page reserves space when it's
  disabled.

Design: [`announcement-banner.md`](announcement-banner.md).

## 1.10 General

Settings → General:

- **User Login Keyword** — the suffix regular users append to their phone number
  (`91234567leave`). 1–12 letters; changing it changes every user's login string
  immediately.
- **Audit Log Retention** — days, default 90, clamped 7–365.

## 1.11 Audit Log

Settings → Audit Log — the full trail of every mutation (events, users,
departments, settings, webhooks, quick links, banner, KAH).

- **Filters:** action, actor, entity type, date range — carried in the URL so
  filtered views are shareable/bookmarkable.
- **Keyset pagination** for large trails; **CSV export** at `/api/audit/export`.
- **Rotation:** rows older than the retention window are purged **on read** (every
  render) plus a manual purge button — no cron.
- Details payloads are flat and human-readable (display names, UTC+8 wall clock,
  rendered event titles) — keep any new payload that way.

Design: [`audit-log.md`](audit-log.md).
