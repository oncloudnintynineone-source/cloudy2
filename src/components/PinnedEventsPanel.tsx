"use client";

import {
  Box,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
import { IconCalendarEvent, IconPin } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { buildEventDeepLink } from "@/lib/events/deepLink";
import { getJson } from "@/lib/api/client";
import type { PinnedEvent } from "@/lib/events/pinned";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import { modalContentWidth } from "@/lib/motion/origin";
import { modalZoomTransitionProps } from "@/lib/motion/transitions";
import { useMotion } from "@/components/MotionProvider";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";
import { usePinnedPanel } from "@/lib/ui/pinnedPanel";
import { AUTOSIZE_VERTICAL_SCROLL_PROPS } from "@/lib/ui/scrollArea";

import { CrossfadeSwap } from "./CrossfadeSwap";
import { EmptyState } from "./EmptyState";
import { LoadingStatus } from "./LoadingStatus";

const LIST_BORDER = "1px solid var(--mantine-color-default-border)";

function formatDay(naive: string): string {
  return naive.slice(0, 10);
}

/** "Wed, Sep 10 · 8:00 AM" — the weekday matters for an upcoming-events list,
 *  and the year is dropped to keep rows compact. */
function formatDisplay(naive: string): string {
  return dayjs(naive).format("ddd, MMM D · h:mm A");
}

interface PinnedEventsPanelProps {
  /** The shell's current list (the same `fetchPinnedEvents` read backing the
   *  ticker). Seeds the very first open so the panel renders real rows at
   *  their final height instead of a taller-than-content skeleton; the panel's
   *  own fetch still confirms freshness underneath. */
  seedEvents?: PinnedEvent[] | null;
  /** Called with the panel's fresh list after a successful fetch so the shell
   *  can seed the header ticker immediately — a failed mount read then heals
   *  the pill on the first panel open, without waiting for the close refresh. */
  onLoaded?: (events: PinnedEvent[]) => void;
}

export function PinnedEventsPanel({ seedEvents = null, onLoaded }: PinnedEventsPanelProps) {
  const { open, originRect, closePanel } = usePinnedPanel();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const [events, setEvents] = useState<PinnedEvent[] | null>(null);
  // The panel's own fetch failed. Only surfaced when there is nothing to show
  // — with a seed list present the stale rows stay (the shell retries on its
  // own), so a transient failure never blanks a list the ticker already has.
  const [failed, setFailed] = useState(false);
  // Render-phase reset on every open (shared recipe with CalendarAccessModal):
  // a fresh open starts from a clean slate, not the last fetch's failure.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setFailed(false);
    }
  }
  // The tapped row whose deep-link navigation is in flight. Its position (in
  // the list's content coordinates) drives an overlay spinner that covers
  // exactly that row until the dashboard navigation commits, then the panel
  // closes — the same feedback event search gives.
  const [opening, setOpening] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isPending && opening !== null) {
      // The navigation transition finished — clear the row spinner and close.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpening(null);
      closePanel();
    }
  }, [isPending, opening, closePanel]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getJson<{ ok: true; events: PinnedEvent[] } | { ok: false; error: string }>("/api/pinned")
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setEvents(result.events);
          // Seed the shell's ticker immediately — a failed mount read heals the
          // pill on the first panel open, not only after the close refresh.
          onLoaded?.(result.events);
        } else {
          setEvents([]);
        }
      })
      .catch(() => {
        // Keep `events` untouched so the list falls back to the shell's seed;
        // a failure only shows when there is nothing to fall back to.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, onLoaded]);

  // Two-tier list: `events` is this panel's confirmed-fresh copy (null until
  // the first fetch resolves, retained across opens afterwards); `seedEvents`
  // is the shell's list, already fetched for the ticker. The visible list is
  // the confirmed copy when present, else the seed — so the normal first open
  // already has content (same data the ticker pill shows) at its final size.
  // The skeleton only appears in the cold-start race where neither the shell's
  // mount fetch nor this panel's own fetch has resolved yet. A minimum hold
  // keeps the skeleton up for a deliberate 150ms even when warm data lands
  // instantly, and `useContentEnter` fades the rows in on reveal.
  const visibleEvents = events ?? seedEvents;
  const loading = useMinSkeletonHold(open && visibleEvents === null && !failed);

  // The modal zooms out of / shrinks back into the header pin button — the
  // app's standard grow/shrink animation. It is `centered` with a fixed size,
  // so the content center is the viewport center and the transform-origin can
  // derive purely from the trigger's rect (see src/lib/motion/origin.ts).
  const motion = useMotion();
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  // The panel widens md (440px) -> lg (620px) at lg, so the shrink-to-target
  // scale must use the matching content width.
  const contentWidth = modalContentWidth(viewport, isNarrow ? 380 : isDesktop ? 620 : 440);
  const transitionProps = modalZoomTransitionProps(motion, originRect, viewport, contentWidth);

  const openEventDay = (event: PinnedEvent, e: React.MouseEvent<HTMLButtonElement>) => {
    // Already navigating to this exact event (its param has not been stripped
    // yet): reopening it would be a no-op navigation and could leave the row
    // spinner up, so just close the panel.
    if (event.eventId && pathname === "/dashboard" && searchParams.get("event") === event.eventId) {
      closePanel();
      return;
    }
    const day = formatDay(event.start);
    // Deep-link the event so the dashboard auto-opens its details; legacy
    // events without a group id fall back to landing on the date alone. Built
    // through the shared `buildEventDeepLink` so the active tab (`?view=`) is
    // carried — opening a pinned event never falls back to a different tab and
    // never switches the visible filters. `_eventCal` lets the server resolve
    // that one event separately, over the target's own months, even when the
    // current view's filters or month range would exclude it.
    const href =
      pathname === "/dashboard" && event.eventId
        ? buildEventDeepLink({
            view: searchParams.get("view"),
            start: event.start,
            eventId: event.eventId,
            calendarId: event.calendarId,
          })
        : event.eventId
          ? `/dashboard?date=${day}&event=${event.eventId}&_eventCal=${event.calendarId}`
          : `/dashboard?date=${day}`;

    const list = listRef.current;
    if (list) {
      const rowRect = e.currentTarget.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      setOpening({
        top: rowRect.top - listRect.top - list.clientTop + list.scrollTop,
        left: rowRect.left - listRect.left - list.clientLeft + list.scrollLeft,
        width: rowRect.width,
        height: rowRect.height,
      });
    }
    startTransition(() => {
      router.push(href);
    });
  };

  // The empty state's one action: close the panel and land on the calendar,
  // where the pin switch lives (the event form's settings step).
  const goToCalendar = () => {
    closePanel();
    if (pathname !== "/dashboard") {
      router.push("/dashboard");
    }
  };

  return (
    <Modal
      opened={open}
      onClose={closePanel}
      centered
      size={isNarrow ? "xs" : isDesktop ? "lg" : "md"}
      title={
        <Group gap="xs">
          <ThemeIcon variant="light" size="sm">
            <IconPin size={14} />
          </ThemeIcon>
          <Text fw={600}>Pinned Events</Text>
        </Group>
      }
      closeButtonProps={{ "aria-label": "Close pinned events" }}
      transitionProps={transitionProps}
    >
      <Text size="xs" c="dimmed" mb="sm">
        Shown to everyone on the header ticker · next 3 months
      </Text>
      <ScrollArea.Autosize
        {...AUTOSIZE_VERTICAL_SCROLL_PROPS}
        mah="min(70dvh, 560px)"
        mx="-md"
        px="md"
      >
        <Box ref={listRef} pos="relative">
          <CrossfadeSwap
            loading={loading}
            mode="overlay"
            skeleton={
              <Box
                style={{
                  border: LIST_BORDER,
                  borderRadius: "var(--mantine-radius-md)",
                  overflow: "hidden",
                }}
              >
                <LoadingStatus label="Loading pinned events" />
                <Stack gap={0}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Group
                      key={index}
                      gap="sm"
                      wrap="nowrap"
                      align="flex-start"
                      style={{
                        padding: "var(--mantine-spacing-sm)",
                        borderTop: index === 0 ? undefined : LIST_BORDER,
                      }}
                    >
                      <Skeleton
                        width={4}
                        height={28}
                        radius={2}
                        style={{ flexShrink: 0, marginTop: 1 }}
                      />
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Stack gap={8}>
                          <Skeleton
                            height={12}
                            radius={2}
                            style={{ width: `${60 - (index % 3) * 12}%` }}
                          />
                          <Skeleton height={8} radius={2} w="40%" />
                        </Stack>
                      </Box>
                    </Group>
                  ))}
                </Stack>
              </Box>
            }
          >
            {failed && visibleEvents === null ? (
              <Text size="sm" c="red">
                Could not load pinned events. Close and try again.
              </Text>
            ) : visibleEvents?.length === 0 ? (
              <EmptyState
                icon={<IconCalendarEvent size={18} />}
                description="No upcoming pinned events. Pin one from the event form's settings step — pinned events show here and on the header ticker."
                actionLabel="Go to calendar"
                onAction={goToCalendar}
              />
            ) : (
              <Box
                style={{
                  border: LIST_BORDER,
                  borderRadius: "var(--mantine-radius-md)",
                  overflow: "hidden",
                }}
              >
                <Stack gap={0}>
                  {visibleEvents?.map((event, index) => (
                    <PinnedEventRow
                      key={event.id}
                      event={event}
                      first={index === 0}
                      onOpen={(e) => openEventDay(event, e)}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </CrossfadeSwap>
          {opening && (
            <Box
              style={{
                position: "absolute",
                top: opening.top,
                left: opening.left,
                width: opening.width,
                height: opening.height,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--mantine-color-body)",
                pointerEvents: "none",
              }}
            >
              <Loader size="sm" color="gray" />
              <LoadingStatus label="Opening event" />
            </Box>
          )}
        </Box>
      </ScrollArea.Autosize>
    </Modal>
  );
}

/**
 * One row of the pinned list — the app's shared list-row recipe (My Events,
 * event search): hairline-separated inside one bordered container, a 4×30px
 * rounded accent bar in the event's read-time color, a truncated semibold
 * title, and one dimmed meta line (time · departments).
 */
function PinnedEventRow({
  event,
  first,
  onOpen,
}: {
  event: PinnedEvent;
  first: boolean;
  onOpen: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const meta = [formatDisplay(event.start), event.departments.join(", ")]
    .filter(Boolean)
    .join(" \u00b7 ");
  return (
    <UnstyledButton
      onClick={onOpen}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "var(--mantine-spacing-sm)",
        borderTop: first ? undefined : LIST_BORDER,
      }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Box
          style={{
            width: 4,
            height: 30,
            borderRadius: 2,
            flexShrink: 0,
            marginTop: 1,
            background: `var(--mantine-color-${event.color}-filled)`,
          }}
        />
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} size="sm" truncate>
            {event.title}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {meta}
          </Text>
        </Box>
      </Group>
    </UnstyledButton>
  );
}
