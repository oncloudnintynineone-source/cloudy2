"use client";

import { Badge, Box, Group, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconCalendarEvent, IconChevronRight } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { MotionModal } from "@/components/MotionModal";
import type { Rect } from "@/lib/motion/origin";
import type { ParadeEvent } from "@/lib/parade/dayEvents";
import { formatEventTimeBadge } from "@/lib/parade/eventTimeBadge";

interface ParadeAgendaModalProps {
  opened: boolean;
  displayName: string;
  date: string;
  dayLabel: string;
  events: readonly ParadeEvent[];
  onClose: () => void;
  onOpenEvent: (event: ParadeEvent, rect: Rect) => void;
}

export function ParadeAgendaModal({
  opened,
  displayName,
  date,
  dayLabel,
  events,
  onClose,
  onOpenEvent,
}: ParadeAgendaModalProps) {
  return (
    <MotionModal
      opened={opened}
      onClose={onClose}
      title={`${displayName} · ${dayLabel}`}
      centered
      size="sm"
    >
      {events.length === 0 ? (
        <EmptyState
          icon={<IconCalendarEvent size={18} />}
          description={`${displayName} has no events on this day.`}
        />
      ) : (
        <ScrollArea.Autosize mah="min(60vh, 480px)" type="auto">
          <Stack gap={0}>
            {events.map((event, index) => {
              const time = formatEventTimeBadge(event, date);
              const meta = [event.eventType, event.location, event.calendarName]
                .filter(Boolean)
                .join(" · ");
              return (
                <UnstyledButton
                  key={event.id}
                  type="button"
                  onClick={(clickEvent) =>
                    onOpenEvent(event, clickEvent.currentTarget.getBoundingClientRect())
                  }
                  aria-label={`View details for ${event.title} — ${time}`}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "var(--mantine-spacing-sm)",
                    borderTop:
                      index === 0 ? undefined : "1px solid var(--mantine-color-default-border)",
                  }}
                >
                  <Group gap="sm" wrap="nowrap" align="center">
                    <Box
                      aria-hidden
                      style={{
                        width: 4,
                        height: 36,
                        borderRadius: 2,
                        flexShrink: 0,
                        background: `var(--mantine-color-${event.color}-filled)`,
                      }}
                    />
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Group gap={6} wrap="wrap">
                        <Badge size="xs" variant="light" color="gray" radius="sm">
                          {time}
                        </Badge>
                        {event.outOfCamp && (
                          <Badge size="xs" variant="light" color="yellow">
                            Out of camp
                          </Badge>
                        )}
                        {event.external && (
                          <Badge size="xs" variant="light" color="gray">
                            External
                          </Badge>
                        )}
                      </Group>
                      <Text size="sm" fw={600} mt={4} style={{ overflowWrap: "anywhere" }}>
                        {event.title}
                      </Text>
                      {meta && (
                        <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                          {meta}
                        </Text>
                      )}
                    </Box>
                    <IconChevronRight
                      size={16}
                      color="var(--mantine-color-dimmed)"
                      aria-hidden
                      style={{ flexShrink: 0 }}
                    />
                  </Group>
                </UnstyledButton>
              );
            })}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </MotionModal>
  );
}
