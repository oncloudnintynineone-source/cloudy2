# Fix: Overview department filter + users filter ("No users to show")

## 1. Problem

A non-admin who filters Overview to a department they are not in, while any
users filter is active (the **"Only me"** quick action, a picked user, or a
stale `users=` URL param), gets the empty-state card *"No users to show.
Assign yourself to a department…"* — the department filter appears not to
apply.

### 1.1 Reproduction (verified against the running app, real DB)

| Viewer | URL | Result |
|---|---|---|
| Bob (dev-CIU) | `/overview` | dev-CIU rows (2 users), 0 events — correct |
| Bob (dev-CIU) | `?cal=4682…` (dev-COU) | dev-COU rows (6 users), 3 events — **correct** |
| Carol (dev-COU) | `?cal=ce68…` (dev-CIU) | dev-CIU rows (2 users) — **correct** |
| Carol (dev-COU) | `?cal=ce68…&users=<Carol>` | **empty matrix + "No users to show"** — bug |
| Bob (dev-CIU) | `?cal=4682…&users=<Bob>` | **empty matrix + "No users to show"** — bug |

So the `cal` filter works; the failure is exclusively the `cal` × `users`
combination for non-admins.

### 1.2 Root cause

`src/app/(protected)/overview/page.tsx`:

- Rows are intersected with the users filter (lines 89–90):
  `filteredUsers = rowUsers.filter(u => selectedUsers.includes(u.id))`.
- For non-admins, `selectedUsers` can only contain own-department users: the
  dialog's Users options are role-scoped (`inviteeUsers`, lines 101–109), and
  the "Only me" action always selects the current user.
- So selecting a different department intersects with own-department users →
  `[]` → empty-state card (misleading message: the user *is* assigned).

The dashboard avoids this by design: rows (`scheduleUsers`,
dashboard/page.tsx:98-99) follow the selected calendars only; the `users`
param filters **events** (`userFilter` in `fetchMonthEvents`), never rows.

### 1.3 Chosen semantics (user-confirmed)

**Match the dashboard:** the users filter narrows events only; matrix rows
always show all active users of the selected department(s). No more empty
matrix from the combination; URL params stay shareable between /dashboard and
/overview.

## 2. Changes

### 2.1 `src/app/(protected)/overview/page.tsx`

- Extract the row computation into a new pure helper (below) and use it:
  `rowUserIds = overviewRowUserIds({...})`.
- **Remove** the `selectedUsers` intersection: counts and department grouping
  use the calendar-scoped rows directly.
- No change to `fetchMonthEvents({ userFilter: selectedUsers })` — the users
  param keeps filtering events.
- `selectedUserIds={selectedUsers}` prop to `OverviewView` stays (dialog state
  + badge).
- Dialog Users options stay role-scoped (same as the dashboard invitee
  picker); no client change in `OverviewView.tsx` required.

### 2.2 New pure helper + tests: `src/lib/overview/scope.ts`, `scope.test.ts`

```ts
export function overviewRowUserIds(params: {
  users: { id: string; status: UserStatus; departmentId: string | null }[];
  selectedCalendarIds: string[];
  calendarCount: number;
  isAdmin: boolean;
  ownDepartmentId: string | null;
}): string[]
```

Encodes today's row semantics verbatim (active only; narrowed selection →
users of selected departments; otherwise role default: admins all, non-admins
own department — no *users* intersection). Unit tests (Vitest, node env, no
DB):

1. non-admin, no `cal` → only own-department active users.
2. non-admin, `cal` = other department → that department's users (**regression
   guard for this bug**).
3. non-admin, `cal` = other department + own-department user id present in the
   users param → **rows unchanged** (documents the new contract: users param
   never narrows rows).
4. admin, default → all active users, incl. unassigned (Unassigned group).
5. inactive users are excluded in all cases.

### 2.3 `progress.md`

Append a short note: Overview filter semantics now mirror the dashboard —
users/type filters narrow events, rows follow the selected department(s);
cross-department + "Only me" no longer produces the empty state.

## 3. Side effects (accepted)

- Admins who previously used `cal` + `users` to hide rows now keep the rows
  (counts drop to 0 for filtered-out events). Consistent with dashboard.
- "Only me" on a foreign department now yields that department's rows with 0s
  (or counts where the user is involved in cross-department events) instead of
  an empty card.

## 4. Out of scope (noted, not changed)

- Non-admin with no department still sees "No users to show" by default
  (pre-existing; Unassigned pseudo-department is admin-only today).
- `activeFilterCount` badge counts the non-admin role default as an active
  calendar filter (identical to dashboard; parity kept).
- Users dialog options stay role-scoped (dashboard invitee-picker parity).

## 5. Verification

1. `pnpm lint && pnpm typecheck && pnpm test` (new scope tests pass; existing
   counts tests untouched).
2. Manual on the running dev server (re-run the repro matrix, session cookies
   via /api/auth/csrf + credentials callback):
   - Carol `?cal=ce68…&users=<Carol>` → dev-CIU rows (2 users) with 0 counts,
     **no** empty card.
   - Bob `?cal=4682…` → dev-COU rows with the 3 events (regression: pure cal
     filter still works).
   - Bob/Carol defaults unchanged from today's captures.
3. `pnpm build` (optional final gate; CI runs lint→typecheck→test→db:generate).
