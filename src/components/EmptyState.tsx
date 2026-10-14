import type { ReactNode } from "react";
import { Button, Stack, Text, ThemeIcon } from "@mantine/core";
import Link from "next/link";

interface EmptyStateProps {
  icon?: ReactNode;
  description: ReactNode;
  /** Optional action: a button wired to a handler, or a client-side link. */
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
}

/**
 * Shared empty-state: a muted icon, a short explanation, and — where a natural
 * next step exists — one action button. Replaces the bare dimmed `Text` that
 * used to leave empty pages as dead ends (see docs/accessibility.md for the
 * related screen-reader conventions).
 */
export function EmptyState({
  icon,
  description,
  actionLabel,
  onAction,
  actionHref,
}: EmptyStateProps) {
  const action = actionLabel ? (
    actionHref ? (
      <Button variant="light" size="sm" component={Link} href={actionHref}>
        {actionLabel}
      </Button>
    ) : onAction ? (
      <Button variant="light" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null
  ) : null;

  return (
    // Entrance: the whole empty-state fades/rises in (`.c2-empty-state-enter`,
    // globals.css) and the icon pops a beat later, so an empty panel reads as
    // arriving rather than switching on (docs/loading-transitions.md).
    <Stack className="c2-empty-state" align="center" gap="xs" py="xl" px="md">
      {icon ? (
        <span className="c2-empty-state-icon">
          <ThemeIcon variant="light" color="gray" size="lg" radius="md" aria-hidden>
            {icon}
          </ThemeIcon>
        </span>
      ) : null}
      <Text c="dimmed" ta="center" size="sm" maw={420}>
        {description}
      </Text>
      {action}
    </Stack>
  );
}
