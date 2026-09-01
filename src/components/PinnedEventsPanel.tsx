"use client";

import {
  Box,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconCalendarEvent, IconPin } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchPinnedEvents, type PinnedEvent } from "@/lib/events/pinned";
import { modalContentWidth, scaleFromRect, transformOriginFromRect } from "@/lib/motion/origin";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";
import { usePinnedPanel } from "@/lib/ui/pinnedPanel";

import { LoadingStatus } from "./LoadingStatus";

function formatDay(naive: string): string {
  const [y, m, d] = naive.slice(0, 10).split("-");
  return `${y}-${m}-${d}`;
}

function formatTime(naive: string): string {
  const hhmm = naive.slice(11, 16);
  const [hh, mm] = hhmm.split(":").map(Number);
  const ampm = hh >= 12 ? "PM" : "AM";
  const hour = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour}:${String(mm).padStart(2, "0")} ${ampm}`;
}

function formatDisplay(naive: string): string {
  const [y, m, d] = naive.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dateStr = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeStr = formatTime(naive);
  return `${dateStr} · ${timeStr}`;
}

export function PinnedEventsPanel() {
  const { open, originRect, closePanel } = usePinnedPanel();
  const router = useRouter();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const [events, setEvents] = useState<PinnedEvent[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchPinnedEvents()
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Skeleton only on the first load (no data yet); later opens reuse the
  // cached list while silently refreshing — no flicker between opens.
  const loading = open && events === null;

  // The modal zooms out of / shrinks back into the header pin button — the
  // app's standard grow/shrink animation. It is `centered` with a fixed size,
  // so the content center is the viewport center and the transform-origin can
  // derive purely from the trigger's rect (see src/lib/motion/origin.ts).
  const viewport = {
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  };
  // The panel widens md (440px) -> lg (620px) at lg, so the shrink-to-target
  // scale must use the matching content width.
  const contentWidth = modalContentWidth(viewport, isNarrow ? 380 : isDesktop ? 620 : 440);
  const transitionProps = {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: { opacity: 0, transform: `scale(${scaleFromRect(originRect, contentWidth)})` },
      common: { transformOrigin: transformOriginFromRect(originRect, viewport, "center") },
      transitionProperty: "transform, opacity",
    },
    duration: 240,
    exitDuration: 200,
    timingFunction: "cubic-bezier(0.3, 1.2, 0.4, 1)",
  } as const;

  const openEventDay = (event: PinnedEvent) => {
    closePanel();
    const day = formatDay(event.start);
    // Deep-link the event so the dashboard auto-opens its details; legacy
    // events without a group id fall back to landing on the date alone. The
    // `_eventCal` hint mirrors event search so the dashboard's fetch always
    // includes the pinned event's calendar even when the current filters
    // exclude it.
    router.push(
      event.eventId
        ? `/dashboard?date=${day}&event=${event.eventId}&_eventCal=${event.calendarId}`
        : `/dashboard?date=${day}`,
    );
  };

  return (
    <Modal
      opened={open}
      onClose={closePanel}
      centered
      size={isNarrow ? "sm" : isDesktop ? "lg" : "md"}
      title={
        <Group gap="xs">
          <ThemeIcon variant="light" size="sm">
            <IconPin size={14} />
          </ThemeIcon>
          <Text fw={700}>Pinned Events</Text>
        </Group>
      }
      closeButtonProps={{ "aria-label": "Close pinned events" }}
      transitionProps={transitionProps}
    >
      <ScrollArea.Autosize mah="min(70dvh, 560px)" mx="-md" px="md">
        <Stack gap="xs">
          {loading ? (
            <>
              <LoadingStatus label="Loading pinned events" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={64} radius="md" />
              ))}
            </>
          ) : null}
          {!loading && events?.length === 0 ? (
            <Paper p="md" radius="md" withBorder>
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon variant="light" color="gray" size="lg" radius="md">
                  <IconCalendarEvent size={18} />
                </ThemeIcon>
                <Text c="dimmed">No upcoming pinned events.</Text>
              </Group>
            </Paper>
          ) : null}
          {events?.map((event) => (
            <Paper
              key={event.id}
              p="md"
              radius="md"
              withBorder
              component="button"
              type="button"
              onClick={() => openEventDay(event)}
              style={{ textAlign: "left", cursor: "pointer" }}
            >
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <Box
                  style={{
                    width: 4,
                    alignSelf: "stretch",
                    borderRadius: 2,
                    flexShrink: 0,
                  }}
                  bg={event.color}
                />
                <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                  <Text fw={600} size="sm" style={{ overflowWrap: "break-word" }}>
                    {event.title}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {formatDisplay(event.start)}
                  </Text>
                  {event.departments.length > 0 ? (
                    <Text size="xs" c="dimmed" style={{ overflowWrap: "break-word" }}>
                      {event.departments.join(", ")}
                    </Text>
                  ) : null}
                </Stack>
              </Group>
            </Paper>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Modal>
  );
}
