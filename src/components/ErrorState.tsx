"use client";

import type { ReactNode } from "react";
import { Box, Button, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconCloudOff, IconRefresh } from "@tabler/icons-react";

/**
 * Shared branded fallback UI for route error boundaries and the not-found
 * page. Renders centered in whatever space it is given: inside the protected
 * shell's main area (route error.tsx keeps the sidebar/bottom nav alive) or
 * bare (login, global-error, not-found).
 */
export function ErrorState({
  icon,
  title = "Something went wrong",
  description = "This page failed to load. Nothing was changed — try again, and check your connection if it keeps happening.",
  onReset,
  action,
}: {
  /** Defaults to a storm-cloud glyph; override per fallback (e.g. 404). */
  icon?: ReactNode;
  title?: string;
  description?: ReactNode;
  /** When set, renders the standard "Try again" button wired to `reset()`. */
  onReset?: () => void;
  /** Custom trailing action(s); ignored when `onReset` is set. */
  action?: ReactNode;
}) {
  return (
    <Box px="md" py="xl">
      <Stack align="center" justify="center" gap="sm" mih="55dvh">
        <ThemeIcon variant="light" color="brand" size={72} radius="50%">
          {icon ?? <IconCloudOff size={36} />}
        </ThemeIcon>
        <Title order={4} ta="center">
          {title}
        </Title>
        <Text c="dimmed" size="sm" ta="center" maw={420} lh={1.5}>
          {description}
        </Text>
        {onReset ? (
          <Button
            mt="xs"
            leftSection={<IconRefresh size={16} />}
            onClick={onReset}
          >
            Try again
          </Button>
        ) : (
          action
        )}
      </Stack>
    </Box>
  );
}
