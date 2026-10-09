/**
 * Shared dashboard data vocabulary. Types the dashboard snapshot and the event
 * wizard both consume live here (in `lib`, not the view) so the cached snapshot
 * shape has no dependency on an app component.
 */

import type { LocationCategory } from "@/lib/events/locationPolicy";
import type { TimeOption } from "@/lib/events/timeOptions";

/** An event type as rendered by the wizard's type picker and the snapshot. */
export interface EventTypeOption {
  name: string;
  shortname: string | null;
  groupId: string | null;
  timeOptions: TimeOption[];
  allowedLocations: LocationCategory[];
  showRemarks: boolean;
  showInvitees: boolean;
  /** Whether the wizard shows the Location step for this type (off = skip). */
  showLocation: boolean;
  /** Admin-pinned event color, null = the deterministic default. */
  color: string | null;
}
