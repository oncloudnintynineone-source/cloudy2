# 1. User guide

Cloudy2 is the company's cloud calendar: who is out, where, and when — plus parade
state, contacts, and KAH status. This guide is for everyday users; administrators
should also read [`admin-guide.md`](admin-guide.md).

## Table of contents

- [1.1 Signing in](#11-signing-in)
- [1.2 Getting around](#12-getting-around)
- [1.3 The calendar](#13-the-calendar)
- [1.4 Events: create, view, edit](#14-events-create-view-edit)
- [1.5 Pinned events](#15-pinned-events)
- [1.6 Quick links](#16-quick-links)
- [1.7 Parade state](#17-parade-state)
- [1.8 Contacts](#18-contacts)
- [1.9 KAH status](#19-kah-status)
- [1.10 Install as an app & offline use](#110-install-as-an-app--offline-use)
- [1.11 Good to know](#111-good-to-know)

## 1.1 Signing in

One input field, no username.

```mermaid
flowchart LR
 A[Single input] --> B{Route}
 B -- "[phone][keyword] → role user" --> C[Sign in as yourself]
 B -- "[phone][keyword] → role admin" --> E{Admin PIN modal}
 E -- "shared admin PIN" --> F[Admin]
 E -- "cancel" --> A
 B -- "no keyword → emergency password" --> G[Emergency admin]
```

- **Regular user** — type your phone number immediately followed by the login
  keyword your administrator gives you, no spaces: `91234567leave`.
- **Admin** — type your phone + keyword the same way; the app then asks for the
  shared admin PIN. The emergency admin instead types the emergency password alone
  (no keyword).

## 1.2 Getting around

| Page | What it's for |
| ---- | ------------- |
| **Calendar** | All events across departments — the main screen |
| **Parade State** | Today's roll call by department, with attendance mode |
| **Contacts** | Phone list with search and VCF export |
| **KAH Status** | Past & future KAH breaches for your groups over ±3 months, with resolved/active/upcoming status; expand a breach to see the group roster (away vs in country) and the overseas events behind it (shown when you are in a KAH group; admins always see it with all groups) |
| **Settings** | Admin only |

On phones the pages sit in the bottom navigation bar; on desktop they move to the
left sidebar (which can collapse to an icon rail). The header carries the
**Pinned events** ticker on the left and, on the right, search, the **Force
refresh** button, and the profile menu — the light/dark theme switch lives inside
that menu.

## 1.3 The calendar

### 1.3.1 Views

Six views show the same calendar data; each view keeps its own filters. Switch
them with the tabs above the grid:

| View | Shows |
| ---- | ----- |
| **Month** | The whole month grid; bars span multiple days. By default the seven days fit the screen width; the round **+/−** controls zoom the day columns in and out |
| **Week (H)** | One week, hour-by-hour, one row per person/department |
| **Week (D)** | One week as day columns — events as spanning banners per row |
| **Day** | A single day, hour-by-hour |
| **Agenda** | A day-by-day list |
| **Month & Agenda** | The Month grid and the Agenda list together — side by side on desktop (drag the divider between them to resize). Tapping a day in the grid shows that day in the agenda pane (event chips aren't clickable — every tap selects the day). On phones the agenda pane is hidden and the grid works like the Month tab: tap an event for its details, tap a day to see that day's events and add a new one |

- **Zoom**: the Day and Week (H) views zoom their hour columns in and out; the
  Month view's columns start at **fit-to-width** (all seven days on screen) and
  zoom in from there. Use the round **+/−** buttons at the right edge of the
  grid — the same cluster where the right pan arrow lives.
- **Pan**: wide grids pan horizontally — drag with the mouse, or use the round
  arrow buttons at the grid's edges (they appear when a grid is wider than the
  screen, e.g. a zoomed-in Month view).
- **Add a view**: tap the **+** at the end of the tab strip, or the **Add view**
  button at the top of the Manage views dialog. Pick the view type from the
  **thumbnail grid** (each option shows a small preview of its layout), then name it.
  On a phone the tab strip is a single **four-squares view button** in the top
  row — tap it, then choose **Add view**.
- **Manage views**: use the **gear** beside the tab strip (tooltip "Manage
  views"). Your views appear as a **list**; the active one is marked with an
  amber bar. Each row has **Edit** (name, type — the type chooser shows the same
  preview grid — and an **Edit filters…** button that switches to the view and
  opens its filter dialog) and **Delete**, plus ↑/↓ to reorder. On a phone the
  gear lives inside the four-squares view button as **Manage views**.
- **Fullscreen** (⋮ menu → **Enter fullscreen**) hides all app
  chrome (and the browser UI where supported) for a wall-display calendar; press
  Esc or use ⋮ menu → **Exit fullscreen** to go back.

### 1.3.2 Dates & filters

- Date-nav arrows move day/week/month; the ⋮ menu has **Today** and **Select date**.
- The **filter button** (funnel icon, with a badge when filters are active) opens
  the filter dialog: Calendars/departments and Users (searchable badge list grouped
  by department) up front, Event Types behind a **Show** toggle, and a **Myself**
  one-tap (events you are tagged on, plus events tagged to your department).
  **Reset** clears them (back to your role default).
- **Filters are per view** — each of Month / Week (H) / Week (D) / Day / Agenda /
  Month & Agenda remembers its own Calendars/Users/Event Types selection, and the dialog notes
  *"These filters apply to {view} only"*. Setting a filter on one view never
  affects the others; clearing one view's filters never resets the rest.
  An untouched view shows your role default (admin: all departments). Filtering
  is not tied to access: everyone can always select **every** department
  calendar, whatever department they belong to or extra access they hold.
- **Force refresh** — the refresh arrow in the header (top-right), on every
  page. It reloads the page from the network (never a saved copy); on the Calendar
  it also pulls the very latest from Google Calendar.

Events created directly in Google Calendar (outside Cloudy2) show an **External**
badge; admins can still edit them.

## 1.4 Events: create, view, edit

### 1.4.1 Creating an event

Tap the **+** button, then walk the wizard. You are the event's **organizer**
(owner) — it is always created as you; there is no "create on behalf of". You are
**not** added to the participants automatically, so select your own name if you will
attend:

1. **Type** — the event type, listed under its category (types without a category
 appear at the bottom under "Ungrouped"); each type can restrict the steps below.
2. **Time** — Start & End date pickers plus tap-select time dropdowns (15-minute
 steps), or Full day / Half day (AM/PM) options.
3. **Location** — one category: **In camp**, **Out of camp**, or **Overseas**
 (the type decides which are allowed), plus an optional specific place. Overseas
 events are what KAH groups count as "away". Some event types **hide the Location
 step** (set by your admin, only for types restricted to one location) — for those
 this step is skipped and the event is saved in that single category automatically.
4. **Participants** — invite individual users and/or tag whole departments; the event
 appears on everyone's calendars. Participants (and members of a tagged department)
 can edit this event too. You're pre-selected by default — remove yourself only if you
 won't take part (an event must keep at least one participant or department). Your own
 badge carries an amber ring and a **(You)** marker wherever participants are listed —
 on this step, the review, and the event's details.
5. **Remarks** — the free-text description.
6. **Other settings** — the **Pin this event** switch (puts the event in the Pinned
 Events panel, §1.5) and, when you're the organizer, "Only I can edit this event"
 (locks editing to you; admins always keep it).
7. **Review** — a summary with a live calendar-title preview, then Create.

Tapping outside the wizard minimizes it to a floating bubble — your draft survives
until you resume or discard it.

### 1.4.2 Viewing and editing

Tap any event for its details. If you are its **organizer**, one of its
**participants**, or a **member of a department it tags** — or an admin — you get
**Edit**, **Duplicate**, and **Delete**. (If the organizer locked the event to
themselves, only they and admins can do these.) Editing prefills the wizard with the
original details and always keeps the original organizer; deleting asks for
confirmation and removes every department copy.

## 1.5 Pinned events

The pill at the header's left edge is the **pinned-events ticker**: it rotates
through your pinned events' titles (one every few seconds) with a
`5d` chip counting down the whole days until the current event starts (`0d` if it
starts today), plus a position/count indicator in one of a few styles — an amber
`1/N` chip, a two-tone pill joining the counter and countdown, a thin progress bar
along the pill's bottom edge, a count badge on the corner, or a stacked
two-line block (admins pick the style on **Settings → Feature Flags**). Tap it to open
a panel listing every explicitly-pinned upcoming
event (today → 3 months out, all departments, ignoring your current filters). Tap
one there to jump straight to it on the calendar and open its details.

Events get pinned through the **Pin this event** switch on the wizard's Other
settings step (§1.4.1).
The ticker and its count refresh after every create/update/delete; with nothing
pinned the pill shows a plain "Pinned events" label.

## 1.6 Quick links

When your admin sets up quick links, an amber **link button** appears beside the
**+** button (phone) or as a "Quick links" chip in the calendar header (desktop).
It opens a menu of external shortcuts — each opens in a new tab.

## 1.7 Parade state

A roll-call view of who is where **today**, grouped by department (including
sub-departments, with aggregated counts):

- Each person shows their status for the day (out-of-camp/overseas events are
  highlighted).
- Department headers show `X/Y` — **in camp** (no out-of-camp event) by default,
  **present** (marked) during attendance mode — aggregated over every
  sub-department.
- The day never auto-drifts: Parade State always opens on today; navigate days
  explicitly with the arrows or date picker.
- **Attendance mode** (clipboard icon): tap to start, then tap each person's card
  to mark them present (the card tints green; a live `X/Y present` count sits in
  the teal **mode bar**). The button becomes **Done** while active — tap it to
  finish. Use **Copy** in the mode bar for a formatted attendance report, and the
  mode bar's overflow menu to **Clear this day** (just today) or **Clear all
  dates…** (every day, with confirmation). Attendance checks are stored **on this
  device only**, per date; the mode survives a reload, but another device or
  person won't see your checks.
- Admins can also have a **snapshot of the parade state emailed to selected people each
  weekday at 08:00** (Settings → Parade State Email). It uses the same in-camp/out-of-camp
  view — attendance checkmarks are device-local and are **not** included.

## 1.8 Contacts

Searchable phone list (name, shortname, or number). Copy a number with one tap, or
download the currently-filtered list as a `.vcf` file to import into your phone.

## 1.9 KAH status

Visible only when you belong to a KAH (Key Appointment Holder) group (admins
always see it too, with all groups). It answers "did my group breach recently,
or will it soon?" over the **past and next 3 months**:

- Each **breach period** — consecutive days where the group's in-country
  percentage fell below its requirement — is listed once, with its date range,
  day count, lowest in-country % during the run, and the members who were away
  (tagged on Overseas events).
- Each period is marked **Resolved** (green — it ended before today), **Active**
  (red — it includes today), or **Upcoming** (amber — it starts in the future).
  A "…" at a period's edge means it runs past the 3-month scan window.
- Groups with no breaches in the window are listed as **All clear**.

## 1.10 Install as an app & offline use

Cloudy2 is a PWA — install it (browser menu → Install / Add to Home screen) for a
full-screen app icon.

- **Instant open:** an installed Cloudy2 opens your last-saved calendar immediately,
  then refreshes in the background.
- **Offline:** previously viewed pages stay available, marked with an amber
  offline banner; any navigation falls back to your most recently saved view.
  Offline is **read-only** — creating or editing shows an error until you're
  back online.
- **Notifications:** your profile menu (avatar, top-right) → **Notifications** lets
  you allow event notifications — you'll get a banner when you're added as a
  participant to an event. On iPhone/iPad this works only from the **installed**
  app (iOS 16.4+), not from a Safari tab, so install Cloudy2 from the Share menu
  first. The same screen has an account-wide pause switch.
- Signing out clears the saved pages.

## 1.11 Good to know

- **Cloudy2 remembers where you left off** — your last page, view, date, and filters
  come back on relaunch (the day on Parade State is the exception: it always opens
  on today).
- **Event titles are templated** by your admin — what you type in Remarks is the
  description; the calendar title combines it with type, people, and location.
- **Themes** — open your profile menu (avatar, top-right) and pick **Light**,
  **Dark**, or **System** (follows the device) — the active one is ticked.
- **Loading style** — pages show skeletons, never dimmed content; buttons show their
  own spinner while working.
- **Modern browsers only** — Cloudy2 needs Safari 16.4 (iOS 16.4) or newer on Apple
  devices, or a current Chrome / Edge / Firefox (version 111+, i.e. from 2023). On
  older browsers the login page shows a short "unsupported browser" notice instead of
  the sign-in form — updating your browser or device is the only way to sign in.
