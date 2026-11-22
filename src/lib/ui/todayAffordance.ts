// The dashboard's "Today" jump affordance (docs/ui-ux-improvements.md A1).
//
// The control exists ONLY while today sits outside the period on screen: on
// today there is nothing to jump back to, and a permanently visible button
// would just duplicate the date picker's own Today action. Which period counts
// as "shown" follows the chrome's own read-out (the same `shown*` state the
// period label renders), per view kind:
//
// - Month: the shown month.
// - Week kinds: the whole shown week (Monday/Sunday per the account's
//   `weekStartsOn`) — a week that merely CONTAINS today shows today.
// - Day / Agenda / Dual Pane: the anchored day (Agenda passes its viewed day).
//
// Pure + unit-tested; the component maps its optimistic state onto this.

import { weekDays, type WeekStart } from "@/lib/events/datetime";

/** The period on screen, in the shape the affordance cares about. */
export type ShownPeriod =
  | { kind: "month"; month: string }
  | { kind: "week"; date: string; weekStartsOn: WeekStart }
  | { kind: "day"; date: string };

/**
 * Whether the shown period excludes `today` — i.e. whether the Today affordance
 * should be visible. All dates are `YYYY-MM-DD` (and months `YYYY-MM`), so
 * plain string comparison is chronological.
 */
export function isOffToday(period: ShownPeriod, today: string): boolean {
  switch (period.kind) {
    case "month":
      return today.slice(0, 7) !== period.month;
    case "week": {
      const week = weekDays(period.date, period.weekStartsOn);
      return today < week[0] || today > week[6];
    }
    case "day":
      return period.date !== today;
  }
}
