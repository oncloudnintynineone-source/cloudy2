// The in-app Guide's content (docs/ui-ux-improvements.md D2).
//
// Deliberately a small typed module, not a CMS — and deliberately terse: the
// canonical prose lives in docs/user-guide.md, so each block is a "what this
// page is for" orientation, never a how-to manual. When behaviour changes,
// change the user guide first and trim these lines to match; do not grow them.
//
// The shortcut list the finding sketched is NOT here: keyboard shortcuts (B5)
// do not exist yet, and a guide must not advertise folklore. Add the section
// when B5 ships.

/** One block of the Guide sheet. */
export interface GuideSection {
  /** Stable id; also the anchor key in the sheet. */
  id: string;
  /** Route prefix this block describes; `null` marks the general block. */
  route: string | null;
  title: string;
  /** One-sentence purpose of the page (or of the app, for the general block). */
  summary: string;
  /** Up to a handful of orientation points — short lines, not prose. */
  points: string[];
}

/** Authored order: the general block leads, then the pages in nav order. */
export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: "getting-started",
    route: null,
    title: "Getting started",
    summary: "Cloudy2 keeps the unit's events, people and KAH status in one calendar.",
    points: [
      "Your login keyword is set by your admin — ask them if it stops working.",
      "Theme and week start live in the profile menu (top-right person icon).",
      "Offline is read-only: what you have opened stays readable; creating or editing waits for the connection. Drafts you started are kept.",
    ],
  },
  {
    id: "dashboard",
    route: "/dashboard",
    title: "Calendar",
    summary: "Your calendar. Each tab is a saved view with its own calendars, people and filters.",
    points: [
      "Tabs, filters and the date picker sit in the toolbar; on phones they float in the bottom rows.",
      "Amber-ringed chips are events you are on; purple marks events created outside Cloudy2 (in Google).",
      "Tap a chip for details, history and sharing. “Back to Today” appears only while you are off today.",
      "Pin an event to the header ticker from the wizard's Other settings step.",
    ],
  },
  {
    id: "parade-state",
    route: "/parade-state",
    title: "Parade State",
    summary: "Daily roll call — who is present, away or overseas on the shown day.",
    points: [
      "The X/Y count is the org-wide snapshot for the day you are viewing.",
      "Your checks are stored on this device only — another device or person will not see them.",
      "Step the day with ‹ › to review a previous parade.",
    ],
  },
  {
    id: "contacts",
    route: "/contacts",
    title: "Contacts",
    summary: "The unit roster — search by name, rank or department.",
    points: ["Export the list you are looking to a .vcf file for phone contacts."],
  },
  {
    id: "double-booking",
    route: "/double-booking",
    title: "Double Booking",
    summary: "A look-ahead for people booked into two events at the same time.",
    points: [
      "Pick a 1, 6 or 12-month window; the amber count in the menu is the default window.",
      "Advisory only — nothing here blocks a booking.",
    ],
  },
  {
    id: "my-events",
    route: "/my-events",
    title: "My Events",
    summary: "Every event you created — including deleted ones, within the retention window.",
    points: ["Tap a row to read the event's full change history."],
  },
  {
    id: "kah-status",
    route: "/kah-status",
    title: "KAH Status",
    summary: "KAH constraint advisories for the coming weeks.",
    points: ["Advisory only — breaches are reported, never blocked."],
  },
  {
    id: "settings",
    route: "/settings",
    title: "Settings (admins)",
    summary: "Admin-only configuration: roster, event types, templates, delivery and system.",
    points: ["Every change made here is written to the audit log."],
  },
];

/**
 * The id of the section whose `route` prefix best matches `pathname` (longest
 * prefix wins, so `/settings/users` still answers `settings`). Falls back to
 * the general block's id when nothing matches — the sheet always has a
 * "current page" to highlight.
 */
export function guideSectionIdForPath(
  sections: readonly GuideSection[],
  pathname: string,
): string {
  let best: GuideSection | null = null;
  for (const section of sections) {
    if (!section.route) continue;
    const hit =
      pathname === section.route || pathname.startsWith(`${section.route.replace(/\/$/, "")}/`);
    if (hit && (!best || section.route.length > best.route!.length)) {
      best = section;
    }
  }
  return best?.id ?? (sections.find((s) => !s.route)?.id ?? sections[0]?.id ?? "");
}

/**
 * Sections ordered for display: the current page's block first, then the
 * general block, then the rest in authored order.
 */
export function orderGuideSections(
  sections: readonly GuideSection[],
  currentId: string,
): GuideSection[] {
  const rank = (s: GuideSection) => (s.id === currentId ? 0 : s.route ? 2 : 1);
  return [...sections].sort((a, b) => rank(a) - rank(b));
}
