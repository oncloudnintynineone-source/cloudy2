import { Badge, Group, Text } from "@mantine/core";

import type { EventClashAffected, EventClashEntry } from "@/lib/events/clashActions";

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
 * emphasised as `You (name)` in the amber brand treatment. `omitUserId` drops
 * one person from the chips (the Double Booking page omits the scanned target,
 * whose involvement is already implied by the report itself); the row renders
 * nothing when no one else remains.
 */
export function ClashAffectedChips({
  affected,
  currentUserId,
  omitUserId,
  max = 6,
}: {
  affected: EventClashAffected[];
  currentUserId: string;
  /** Drop this user from the chips; renders nothing when no one else remains. */
  omitUserId?: string;
  /** Cap on rendered chips before the `+N more` summary kicks in. */
  max?: number;
}) {
  const filtered = omitUserId ? affected.filter((person) => person.userId !== omitUserId) : affected;
  if (filtered.length === 0) {
    return null;
  }
  const visible = filtered.slice(0, max);
  const rest = filtered.length - visible.length;
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
