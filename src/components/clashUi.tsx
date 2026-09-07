import { Badge, Group, Text } from "@mantine/core";
import dayjs from "dayjs";

import type { EventClashAffected, EventClashEntry } from "@/lib/events/clashActions";

/** Parse a naive `YYYY-MM-DD HH:mm:ss` string to a local `Date` (for labels). */
function naiveToDate(naive: string): Date | null {
  if (!naive) {
    return null;
  }
  const [datePart, timePart] = naive.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes, seconds] = (timePart ?? "00:00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

/** Human-friendly naive datetime — date-only for all-day entries. */
function fmtNaive(naive: string, allDay: boolean): string {
  const date = naiveToDate(naive);
  if (!date) {
    return "";
  }
  return allDay ? dayjs(date).format("MMM D, YYYY") : dayjs(date).format("MMM D, YYYY h:mm A");
}

/**
 * Human window label for a clash entry (all-day ends arrive as inclusive naive
 * dates), e.g. `Aug 17, 2026 9:00 AM – 10:30 AM`. Shared by the wizard's
 * review-step advisory and the Double Booking page.
 */
export function eventWhenLabel(entry: EventClashEntry): string {
  const start = fmtNaive(entry.startNaive, entry.allDay);
  const end = fmtNaive(entry.endNaive, entry.allDay);
  if (!end || end === start) {
    return start || (entry.startNaive ? `${entry.startNaive} – ${entry.endNaive}` : "");
  }
  return `${start} – ${end}`;
}

/**
 * Collapsed one-liner preview of a clash's offending events: up to `max`
 * titles joined with `·`, then `· +N more` when titles remain, e.g.
 * `Morning briefing · Marathon debrief · +1 more`. Empty when there are no
 * titles. Shared by the Double Booking page report cards and the wizard's
 * review-step advisory.
 */
export function clashTitlesPreview(entries: EventClashEntry[], max = 2): string {
  const titles = entries.map((entry) => entry.title).filter(Boolean);
  if (titles.length === 0) {
    return "";
  }
  const shown = titles.slice(0, max);
  const rest = titles.length - shown.length;
  return shown.join(" · ") + (rest > 0 ? ` · +${rest} more` : "");
}

/**
 * The affected people chips for one clash, with the acting session user
 * emphasised as `You (name)` in the amber brand treatment.
 */
export function ClashAffectedChips({
  affected,
  currentUserId,
  max = 6,
}: {
  affected: EventClashAffected[];
  currentUserId: string;
  /** Cap on rendered chips before the `+N more` summary kicks in. */
  max?: number;
}) {
  const visible = affected.slice(0, max);
  const rest = affected.length - visible.length;
  return (
    <Group gap={4} wrap="wrap">
      {visible.map((person) => {
        const isYou = person.userId === currentUserId;
        return (
          <Badge
            key={person.userId}
            size="xs"
            variant={isYou ? "filled" : "light"}
            color={isYou ? "accent" : "brand"}
          >
            {isYou ? `You (${person.name})` : person.name}
          </Badge>
        );
      })}
      {rest > 0 && (
        <Text size="xs" c="dimmed">
          +{rest} more
        </Text>
      )}
    </Group>
  );
}
