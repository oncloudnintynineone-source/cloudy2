# 1. Event participant notifications (Web Push)

Roster users are notified — via standard **Web Push** (the browser Push API with
VAPID) — when they are **included as participants** in a newly-created event, or
**added** to an existing event. Department tags include every **active** member
of the department (the same occupancy model the clash engine and the edit guard
use). The acting user who performed the create/edit is never notified.

This is a **notify-only** feature, in the same spirit as the KAH breach check,
webhooks and clash advisories: delivery is best-effort, runs inside `after()`,
and can never delay or fail the mutation.

## Table of contents

- [1.1 When a notification is sent](#11-when-a-notification-is-sent)
- [1.2 Channels & reachability](#12-channels--reachability)
- [1.3 Flow](#13-flow)
- [1.4 Data model](#14-data-model)
- [1.5 Environment](#15-environment)
- [1.6 Server path](#16-server-path)
- [1.7 Service worker](#17-service-worker)
- [1.8 User surface (Notifications dialog)](#18-user-surface-notifications-dialog)
- [1.9 Audit trail](#19-audit-trail)
- [1.10 Platform notes & limits](#110-platform-notes--limits)
- [1.11 Files](#111-files)

## 1.1 When a notification is sent

A notification goes out after a successful event **create** or **update**
(never delete), for every roster user who is newly included as a participant:

| Situation                                                          | Notified                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| New event created                                                  | every participant (tagged users + active members of tagged depts) |
| Existing event edited — a user is tagged                           | that user                                                         |
| Existing event edited — a department is newly tagged               | every active member of that department                            |
| Existing event edited (time/title/location only)                   | nobody (the added-set is empty)                                   |
| User removed from an event / event deleted                         | nobody                                                            |

Semantics follow the clash **occupancy** model (`busyUsersOfEvent` in
`src/lib/events/clashes.ts`): a user is "included" when they are tagged by id
**or** an active member of a tagged department. The organizer (`createdBy`) is a
participant only when self-tagged; an event type with invitees disabled stores
the organizer as its sole attendee, so only they are "added" (and, being the
actor on create, never notified).

The diff is computed against the **mutation-time roster snapshot**: old state
(the pre-edit ref) and new state (the effective input) are both expanded with
the same current `activeMembershipsByDepartment` map. A member who joined a
department *after* it was first tagged is not re-reported by a later unrelated
edit, and re-saving an event never spams an already-tagged department's members.
Removing then re-adding a user later *does* re-notify them.

## 1.2 Channels & reachability

Only **Web Push** is used (no email fallback):

- **Android**: installed PWA via Chrome — fully supported.
- **iOS / iPadOS**: the **installed home-screen web app** on iOS/iPadOS **16.4+**
  (the app's browser floor is already Safari 16.4). Push is *not* delivered in
  Safari browser tabs — a user who opens the site in a tab sees no banner and
  cannot enable it.
- A user must (1) be an **active** roster user, (2) have granted the browser
  **permission**, (3) have a stored **subscription** for the device, and (4) have
  the account-wide **master switch** on.

Users' email addresses are optional on profiles and are **not** used here; a user
without a subscribed device simply receives nothing.

## 1.3 Flow

```mermaid
sequenceDiagram
  participant U as User (wizard)
  participant A as server action<br/>(create/updateEvent)
  participant G as Google Calendar
  participant P as after() dispatch
  participant D as Neon
  participant S as Web Push service

  U->>A: save event (people: old + new)
  A->>G: write copies
  A->>A: logAction + webhook + KAH + caches
  A->>P: dispatchParticipantNotifications({before, after, copies, …})
  Note over A: mutation returns; response not delayed
  P->>D: roster memberships + added-set diff
  P->>D: filter actor, active users, master switch, subscriptions
  P->>D: audit row (event.participantNotify)
  P->>S: sendNotification (per subscription, VAPID)
  S-->>P: ok / 404 / 410
  P->>D: prune dead endpoint on 404/410
```

## 1.4 Data model

Migration `0038_late_ultimates`:

- **`push_subscriptions`** — one row per browser push endpoint:
  - `user_id` → `users.id` (cascade delete), `endpoint` (unique), `keys` JSONB
    (`{ p256dh, auth }`), timestamps.
  - A user on several devices has several rows. Because the *endpoint* is unique,
    a device shared by two accounts is **re-`userId`d** to the currently signed-in
    account by `syncPushSubscription` (an upsert-by-endpoint), so no account's
    pushes leak to a device now used by another account.
- **`user_preferences.event_invite_push`** — the account-wide **master switch**
  (boolean, default `true`, independent of the OS permission). Row is lazily
  ensured on first write; an absent row means enabled.

No in-app event table is touched: event participant state lives in the Google
notes block (`inviteeUsers` / `inviteeDepartments`), exactly as the create/update
actions already read it.

## 1.5 Environment

The VAPID pair is generated **once** (`npx web-push generate-vapid-keys`) and
**shared across environments** — the keys identify the application server, so a
device subscribed through the Vercel origin keeps validating when the same
keypair signs from the Cloud Run shadow. Required on every deploy surface
(Vercel Production + Preview, Cloud Run shadow, `.env.local`):

| Variable                       | Purpose                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key — inlined into the client (`pushManager.subscribe`) |
| `VAPID_PRIVATE_KEY`            | VAPID private key (server-only secret)                               |
| `VAPID_SUBJECT`                | `mailto:` (or `https:`) contact identifying the app to the push service |

Without all three the feature is **disabled gracefully**: no crash, no sends.
Rotating the pair invalidates existing subscriptions; their next delivery fails
with 404/410 and prunes the row (users re-enable once from the Notifications
dialog, which re-subscribes under the new key).

## 1.6 Server path

Entry points — `src/lib/events/actions.ts`:

- `createEvent`: after the copies are written, KAH/webhook/cache work and before
  `revalidatePath`, calls `dispatchParticipantNotifications({ reason: "created",
  before: null, after: effectiveInput people, … })`.
- `updateEvent`: same site, `reason: "added"`, `before` = the ref's stored
  people, `after` = the effective input people.
- `deleteEvent`: no dispatch (deletion frees people).

`dispatchParticipantNotifications` (`src/lib/events/participantNotify/notify.ts`)
registers one `after(async () => …)` and returns immediately. Inside:

1. `parseVapidConfig()` (pure, `vapid.ts`) — bail when unconfigured.
2. `activeMembershipsByDepartment(old ∪ new dept ids)` →
   `computeAddedUserIds(before, after, memberships)` (pure, `diff.ts`) →
   drop the **acting user**.
3. Resolve the added ids against `users` (keep `status = 'active'`), drop rows
   whose `userPreferences.eventInvitePush` is `false`, then load their
   `push_subscriptions`. Empty at any step → no-op.
4. Build the shared text (`message.ts`, pure; reuses the audit log's UTC+8 wall
   clock via `formatEventAuditTime`) and a **per-recipient** deep link: the copy
   on the recipient's own department calendar when it exists, else the first
   copy — `/dashboard?date=<start>&event=<eventId>&_eventCal=<calendarId>` so the
   dashboard's fetch includes the event regardless of the user's filters.
5. **Audit first** (`AUDIT_ACTIONS.eventParticipantNotify` —
   `event.participantNotify`) so the send is on record even when delivery fails.
6. Send one push per subscription (`web-push`, `sendNotification`, TTL 7 days,
   10s timeout, payload `{ title, body, tag: eventId, url }`). 404/410 →
   `deletePushSubscriptionById` (endpoint gone); other errors are logged and
   swallowed.

## 1.7 Service worker

`src/app/sw.ts` (the Serwist SW) gains two plain listeners, appended after
`serwist.addEventListeners()` — the caching routes are untouched:

- **`push`**: reads the JSON payload and calls
  `registration.showNotification(title, { body, icon, badge, tag, data: { url } })`.
  The `tag` (the event id) collapses repeated pushes for the same event. A
  payload-less push falls back to a branded generic instead of nothing. Nothing
  is fetched from the network in the push event — payloads are kept small for iOS.
- **`notificationclick`**: closes the notification, focuses an existing window
  client (navigating it to the deep link) or opens a new one. Tapping a
  notification lands on the event's details modal.

## 1.8 User surface (Notifications dialog)

`Profile menu → Notifications` (`NotificationSettings.tsx`, mounted in
`UserMenu.tsx` like the Calendar Access modal) presents:

- **Enable on this device** — the button calls `Notification.requestPermission()`
  synchronously in the click (required on iOS), then subscribes through the
  controlling SW's `pushManager` with the inlined `applicationServerKey`, then
  persists via the `syncPushSubscription` server action.
- **Turn off on this device** — unsubscribes the browser and calls
  `unsyncPushSubscription`.
- **Receive event-invite notifications** — the account-wide master switch
  (`setEventInvitePush`), paused independently of the browser permission.
- Browser-state-specific messaging: unsupported (Safari tab / old iOS →
  "add to Home Screen"), denied (pointer to the browser/phone notification
  settings), and the global-Admin account (no `users` row → cannot subscribe).

Browser mechanics live in `src/lib/events/participantNotify/client.ts`
(capability detection, VAPID key conversion, subscribe/unsubscribe); the server
actions live in `participantNotify/actions.ts`.

## 1.9 Audit trail

Every send batch writes one `audit_logs` row (`event.participantNotify`):

- `entityId` = the first copy's calendar id; `entityName` = the notification
  headline; `details` = `{ eventId, reason, notified: n, devices: m,
  recipients: "<names, comma-joined>" }`.

There is deliberately **no dedup table** (unlike KAH): the added-set diff makes
re-saves of an unchanged participant set a no-op, so duplicates only arise from
genuinely re-adding someone.

## 1.10 Platform notes & limits

- **iOS**: push needs the app added to Home Screen on iOS/iPadOS 16.4+. An app
  installed before upgrading may need a one-time remove + re-add to unlock push.
  There is no per-app notification settings deep link on iOS — the dialog text
  explains re-enabling.
- **Payloads** are tiny and encrypted in transit by the push service.
- **Offline**: if the device is offline when the server sends, the push service
  queues it (TTL 7 days) and the SW shows it when the device returns. If the app
  is open, the notification still appears (the SW cannot tell focus); the page
  itself is not mutated until the user taps through.
- **Shared devices**: a push subscription is browser-level; re-sign-in with a
  different account re-owns the row only when that account subscribes/syncs.
  Until then the previous owner's sends may still reach the device (treated as a
  stale device, not a leak).

## 1.11 Files

| File                                                            | Role                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/lib/events/participantNotify/vapid.ts` (+ test)            | Pure VAPID env parsing                                        |
| `src/lib/events/participantNotify/diff.ts` (+ test)             | Pure occupancy diff (`computeAddedUserIds`)                   |
| `src/lib/events/participantNotify/message.ts` (+ test)          | Pure notification text builder                                |
| `src/lib/events/participantNotify/subscriptions.ts`             | `push_subscriptions` DB access (list/upsert/delete)           |
| `src/lib/events/participantNotify/notify.ts`                    | `dispatchParticipantNotifications` (`after()` send path)      |
| `src/lib/events/participantNotify/actions.ts`                   | Server actions (settings read/write, subscribe/unsync)        |
| `src/lib/events/participantNotify/client.ts`                    | Browser-side push helpers (permission/subscribe)              |
| `src/components/NotificationSettings.tsx`                       | Profile-menu Notifications dialog                             |
| `src/components/UserMenu.tsx`                                   | Menu entry + modal mount                                      |
| `src/app/sw.ts`                                                 | `push` / `notificationclick` handlers                         |
| `src/lib/events/actions.ts`                                     | Dispatch calls in `createEvent` / `updateEvent`               |
| `src/db/schema.ts`, `drizzle/0038_late_ultimates.sql`           | `push_subscriptions`, `user_preferences.event_invite_push`    |
| `.env.example`, `docs/developer-guide.md`, `AGENTS.md`          | Env + deployment docs                                         |
