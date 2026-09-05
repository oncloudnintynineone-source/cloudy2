"use client";

import { useEffect, useState } from "react";
import { Anchor, Badge, Button, Group, Loader, Modal, Paper, Stack, Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

import { NARROW_MEDIA_QUERY } from "@/lib/theme";
import {
  getMyCalendarAccess,
  type MyCalendarAccessResult,
  type MyCalendarRow,
} from "@/lib/roster/actions";

const ROLE_LABELS: Record<MyCalendarRow["role"], string> = {
  reader: "Read only",
  writer: "Can edit",
  owner: "Owner",
};

/** The Google "add calendar to my account" web link (same pattern as the
 *  department modal) — Google handles auth against the visitor's own account. */
function addCalendarHref(googleCalendarId: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(googleCalendarId)}`;
}

function CalendarRow({ calendar }: { calendar: MyCalendarRow }) {
  return (
    <Paper withBorder p="xs" radius="md">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" gap="xs" align="center">
          <Text size="sm" fw={500} style={{ minWidth: 0 }}>
            {calendar.name}
          </Text>
          <Group gap={6} wrap="wrap">
            {calendar.source === "department" && (
              <Badge size="sm" variant="light" color="brand">
                Your department
              </Badge>
            )}
            <Badge
              size="sm"
              variant="light"
              color={
                calendar.role === "owner"
                  ? "brand"
                  : calendar.role === "writer"
                    ? "accent"
                    : "gray"
              }
            >
              {ROLE_LABELS[calendar.role]}
            </Badge>
          </Group>
        </Group>
        <Anchor
          href={addCalendarHref(calendar.googleCalendarId)}
          target="_blank"
          rel="noreferrer"
          size="sm"
        >
          Add to my Google Calendar
        </Anchor>
      </Stack>
    </Paper>
  );
}

interface CalendarAccessModalProps {
  opened: boolean;
  onClose: () => void;
}

export function CalendarAccessModal({ opened, onClose }: CalendarAccessModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const [data, setData] = useState<MyCalendarAccessResult | null>(null);

  // Render-phase reset on every open (same pattern as DateSelectorModal): the
  // fresh open must start from a loading state, not the last fetch's result.
  const [lastOpened, setLastOpened] = useState(opened);
  if (lastOpened !== opened) {
    setLastOpened(opened);
    if (opened) {
      setData(null);
    }
  }

  const [requestKey, setRequestKey] = useState(0);

  // Fetch on every open — the access can change while the app stays mounted.
  // Only asynchronous state updates happen here (setData resolves after the
  // awaited server action), so no cascading render. Bumping `requestKey`
  // (the retry button) refetches while the modal stays open.
  useEffect(() => {
    if (opened) {
      getMyCalendarAccess()
        .then(setData)
        .catch(() => setData({ ok: false, error: "Couldn't load your calendar access" }));
    }
  }, [opened, requestKey]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Calendar access"
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
    >
      {!data ? (
        <Group justify="center" py="lg">
          <Loader size="sm" />
        </Group>
      ) : data.ok ? (
        data.hasProfile ? (
          <Stack gap="md">
            <Stack gap={2}>
              <Text fw={500} size="sm">
                Calendars shared with you
              </Text>
              <Text size="sm" c="dimmed">
                Your own department is shared automatically; extra departments appear here when an
                admin grants them. Add one to see its events in your own Google Calendar app.
              </Text>
            </Stack>

            {data.calendars.length === 0 ? (
              <Text size="sm" c="dimmed">
                No department calendars are shared with this account yet. Ask an admin to assign you
                to a department or grant you access.
              </Text>
            ) : (
              <Stack gap={6}>
                {data.calendars.map((calendar) => (
                  <CalendarRow key={calendar.calendarId} calendar={calendar} />
                ))}
              </Stack>
            )}

            {data.email ? (
              <Text size="xs" c="dimmed">
                After adding, the calendar appears under “Other calendars” in Google Calendar on any
                device signed in as {data.email}.
              </Text>
            ) : (
              <Text size="xs" c="orange">
                No email is linked to your account, so these calendars are not shared with a Google
                account yet. Ask an admin to add your email.
              </Text>
            )}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            This is the global Admin account, not a roster profile, so it isn&apos;t a member of any
            department calendar. Log in with your own account to add your department&apos;s
            calendar here.
          </Text>
        )
      ) : (
        <Stack gap="sm" align="flex-start">
          <Text size="sm" c="red">
            {data.error}
          </Text>
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              setData(null);
              setRequestKey((key) => key + 1);
            }}
          >
            Try again
          </Button>
        </Stack>
      )}
    </Modal>
  );
}
