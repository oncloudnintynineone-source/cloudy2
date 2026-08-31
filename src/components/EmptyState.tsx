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
    <Stack align="center" gap="xs" py="xl" px="md">
      {icon ? (
        <ThemeIcon variant="light" color="gray" size="lg" radius="md" aria-hidden>
          {icon}
        </ThemeIcon>
      ) : null}
      <Text c="dimmed" ta="center" size="sm" maw={420}>
        {description}
      </Text>
      {action}
    </Stack>
  );
}
