# Filter dialogs: cross-department user options (Overview + Dashboard)

## 1. Problem

Non-admins can switch the **Calendars** filter to any department on both
tabs, but the **Users** filter group in the dialog only lists
**own-department** users — so "filter for other departments and their users"
is impossible:

- Overview: `src/app/(protected)/overview/page.tsx:102-110` builds
  `inviteeUsers` as `isAdmin ? activeUsers : ownDeptActiveUsers` — feeds the
  dialog's Users group (and is the only use of that prop in
  `OverviewView.tsx`).
- Dashboard: `src/app/(protected)/dashboard/page.tsx:92-96` `pickerUsers`
  (role-scoped) feeds **both** the filter dialog's Users group
  (`DashboardView.tsx:218,229`) **and** the EventForm invitee picker
  (`DashboardView.tsx:767`).

The server side already accepts any user id: `?users=` is only validated
against all roster ids (`overview/page.tsx:67-71`, `dashboard/page.tsx:83-87`)
and `fetchMonthEvents({ userFilter })` has no role check. So the dialog
option list is the only blocker.

**Must not change:** event *creation* invitee picker (EventForm) stays
own-department-scoped for non-admins (creation permission context).

## 2. Design (user-confirmed: both pages)

Give each filter dialog its own option list — **users of the selected
department(s)**, always including the current user (so "Only me" works and
renders with a proper label on foreign departments; a selected value missing
from `data` would render as a raw uuid chip in Mantine's MultiSelect).

Semantics per role:
- Admin: all active users (unchanged) + self if in roster.
- Non-admin: active users whose department ∈ `selectedCalendars` (same set as
  the visible rows/schedule) + self (looked up in the full roster, any
  status — an inactive self can still filter their own past events).
- Non-admin without a department: options = self only (dialog group appears
  with a single option instead of being hidden — "Only me" now works).

## 3. Changes

### 3.1 New shared pure helper — `src/lib/filters/filterUserOptions.ts`

```ts
import type { UserStatus } from "@/lib/roster/validate";

export interface FilterUserSource {
  id: string;
  status: UserStatus;
  department: { id: string } | null;
}

/**
 * Ids offered by a filter dialog's Users group: the ids of the users in view
 * (rows of the selected departments) plus, when present in the roster and not
 * already included, the current user — so "Only me" always works.
 */
export function filterUserOptionIds(params: {
  users: readonly FilterUserSource[];
  rowUserIds: readonly string[];
  currentUserId: string;
}): string[]
```

`filterUsers/filterUserOptions.test.ts` (~5 tests): self already in rows →
unchanged; self in roster, not in rows → appended; self not in roster (e.g.
`"admin"` session id) → untouched; dedupe; empty rows + self → `[self]`.

### 3.2 Overview — `overview/page.tsx` + `OverviewView.tsx`

- Replace the role-scoped `inviteeUsers` block (lines 102-110) with:
  `const filterUserIds = filterUserOptionIds({ users: allUsers,
  rowUserIds, currentUserId: session.user.id });` then map to
  `{ id, displayName: formatFullName(..., settings.nameTemplate) }`.
- Rename the view prop `inviteeUsers` → `filterUsers` (internal clarity;
  `OverviewView` uses it only for the dialog's Users group).

### 3.3 Dashboard — `dashboard/page.tsx` + `DashboardView.tsx`

- Compute a new **`filterUsers`** list: `filterUserOptionIds({ users:
  allUsers, rowUserIds: scheduleUsers.map(u => u.id), currentUserId:
  session.user.id })` + display names (existing `formatFullName` pattern).
  Keep `inviteeUsers` exactly as-is (EventForm, `peopleNames`).
- `DashboardView.tsx`: add `filterUsers: { id: string; displayName:
  string }[]` prop; `filterGroups` (lines 218-250) uses `filterUsers` for
  `userOptions` and for the "Only me" action condition (line 229) instead of
  `inviteeUsers`. `EventForm inviteeUsers={inviteeUsers}` (line 767)
  untouched; `PeopleSelect`/creation flows untouched.

### 3.4 `progress.md`

- TOC + status bullet + new section **1.38** describing the change, the
  intentional creation-picker carve-out, and verification results (§1.28-style
  entry with the live re-check table).

## 4. Behavior notes / side effects (accepted)

- Non-admin default view is unchanged in practice: own-dept users + self ==
  previous options (self was already there when active & assigned).
- Admin behavior unchanged (all active users); "admin" session (id `"admin"`,
  not in roster) gains no self option — same as today (no "Only me" for that
  synthetic id).
- Stale `?users=` of any department now render with proper labels once that
  department is (re)selected.

## 5. Verification

1. `pnpm lint && pnpm typecheck && pnpm test` (244 existing + ~5 new) and
   `pnpm build`; `pnpm db:generate` (no schema change, expect no drift).
2. Live re-check on the dev server (Bob = dev-CIU, Carol = dev-COU; sessions
   already available in `/tmp/opencode/*.txt`):
   - `/overview?cal=dev-COU` → flight `filterUsers` (formerly `inviteeUsers`)
     = 6 dev-COU users **plus** "Bob Lim (CG: dev-CIU)".
   - `/overview?cal=dev-COU&users=<Carol>` → Carol's events count, rows the
     full dev-COU set, no empty card.
   - `/dashboard?cal=dev-COU` → DashboardView props: `filterUsers` includes
     dev-COU users + Bob; **`inviteeUsers` (EventForm) still own-dept only**.
   - `/dashboard` default → filter `filterUsers` = own-dept users (unchanged).
3. Grep-verify no other consumer of the renamed/added props
   (`rg "inviteeUsers" src` — remaining uses must be creation-context only).
