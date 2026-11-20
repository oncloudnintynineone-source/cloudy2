"use client";

import { Button, Stack, Text } from "@mantine/core";

export interface InlineErrorProps {
  message: string;
  /** Omit for a non-retryable failure. */
  onRetry?: () => void;
  retryLabel?: string;
}

/** The shared inline failure line inside a dialog body. */
export function InlineError({ message, onRetry, retryLabel = "Try again" }: InlineErrorProps) {
  return (
    <Stack gap="sm" align="flex-start">
      <Text size="sm" c="red">
        {message}
      </Text>
      {onRetry ? (
        <Button size="xs" variant="light" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </Stack>
  );
}
