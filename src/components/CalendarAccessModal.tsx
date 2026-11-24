"use client";

import {
  Anchor,
  Badge,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { MotionModal } from "@/components/MotionModal";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { InlineError } from "@/components/InlineError";
import { LoadingStatus } from "@/components/LoadingStatus";
import { useOpenQuery } from "@/lib/loading/useOpenQuery";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import { useModalSize } from "@/lib/motion/useModalZoom";
import {
  getMyCalendarAccess,
  type MyCalendarAccessResult,
  type MyCalendarRow,
} from "@/lib/roster/actions";
import { EXTERNAL_LINK_PROPS } from "@/lib/ui/externalLink";

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
                calendar.role === "owner" ? "brand" : calendar.role === "writer" ? "accent" : "gray"
              }
            >
              {ROLE_LABELS[calendar.role]}
            </Badge>
          </Group>
        </Group>
        <Anchor
          href={addCalendarHref(calendar.googleCalendarId)}
          {...EXTERNAL_LINK_PROPS}
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

const mapCalendarAccessError = () => "Couldn't load your calendar access";

export function CalendarAccessModal({ opened, onClose }: CalendarAccessModalProps) {
  const size = useModalSize({ narrow: "xs", mobile: "sm", desktop: "md" });
  const query = useOpenQuery<MyCalendarAccessResult>({
    enabled: opened,
    load: getMyCalendarAccess,
    mapError: mapCalendarAccessError,
  });
  const data = query.data;

  return (
    <MotionModal
      opened={opened}
      onClose={onClose}
      title="Calendar access"
      centered
      size={size}
    >
      <CrossfadeSwap
        loading={query.status === "loading" || query.status === "idle"}
        minHoldMs={MIN_SKELETON_HOLD_MS}
        mode="overlay"
        animateHeight
        skeleton={
          <Stack gap="sm">
            <LoadingStatus label="Loading calendar access" />
            <Skeleton height={14} radius="sm" width="60%" />
            <Skeleton height={40} radius="sm" />
            <Skeleton height={40} radius="sm" />
            <Skeleton height={40} radius="sm" />
          </Stack>
        }
      >
        {query.status === "error" ? (
          <InlineError
            message={query.error ?? "Couldn't load your calendar access"}
            onRetry={query.reload}
          />
        ) : data === null ? null : !data.ok ? (
          <InlineError message={data.error} onRetry={query.reload} />
        ) : data.hasProfile ? (
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
                  No department calendars are shared with this account yet. Ask an admin to assign
                  you to a department or grant you access.
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
                  After adding, the calendar appears under “Other calendars” in Google Calendar on
                  any device signed in as {data.email}.
                </Text>
              ) : (
                <Text size="xs" c="orange">
                  No email is linked to your account, so these calendars are not shared with a
                  Google account yet. Ask an admin to add your email.
                </Text>
              )}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              This is the global Admin account, not a roster profile, so it isn&apos;t a member of
              any department calendar. Log in with your own account to add your department&apos;s
              calendar here.
            </Text>
          )
        }
      </CrossfadeSwap>
    </MotionModal>
  );
}
