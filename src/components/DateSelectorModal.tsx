"use client";

import dayjs from "dayjs";
import { useState } from "react";
import { ActionIcon, Box, Button, Modal, Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
import { DatesProvider, MonthPicker } from "@mantine/dates";
import { MobileMonthView } from "@mantine/schedule";
import "@mantine/schedule/styles.css";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";
import { firstDayOfWeek, weekDays, type WeekStart } from "@/lib/events/datetime";
import {
  modalContentWidth,
  scaleFromRect,
  transformOriginFromRect,
  type Rect,
} from "@/lib/motion/origin";
import { MOTION } from "@/lib/motion/timing";

export type DateSelectorKind = "month" | "week" | "day";

interface DateSelectorModalProps {
  opened: boolean;
  /** Picker flavor driven by the active dashboard view. */
  kind: DateSelectorKind;
  /** Anchor value: `YYYY-MM-DD` for day/week, `YYYY-MM` for month. */
  date: string;
  /** Called with `YYYY-MM-DD` (day/week) or `YYYY-MM` (month) when picked. */
  onPick: (value: string) => void;
  onToday: () => void;
  onClose: () => void;
  /** Trigger rect; the dialog grows out of / shrinks back into it. */
  originRect?: Rect | null;
  /** Which day the account's week starts on (default Monday). */
  weekStartsOn?: WeekStart;
}

const WEEK_TINT = "color-mix(in srgb, var(--mantine-primary-color-filled) 15%, transparent)";

export function DateSelectorModal({
  opened,
  kind,
  date,
  onPick,
  onToday,
  onClose,
  originRect = null,
  weekStartsOn = "monday",
}: DateSelectorModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const [pickerDate, setPickerDate] = useState(date);
  // Re-seed the displayed month every time the modal opens (render-phase
  // reset, same pattern as the agenda date in DashboardView).
  const [lastOpened, setLastOpened] = useState(opened);
  if (lastOpened !== opened) {
    setLastOpened(opened);
    if (opened) {
      setPickerDate(date);
    }
  }

  const title = kind === "month" ? "Select month" : kind === "week" ? "Select week" : "Select date";

  const shiftMonth = (delta: number) =>
    setPickerDate(dayjs(pickerDate).add(delta, "month").format("YYYY-MM-DD"));

  // Week picker: highlight the account's week (Monday- or Sunday-first)
  // `selectedDate` already fills the anchor's circle; the other six days get a
  // subtle brand tint (rounded on the leading/trailing ends) so the week reads
  // as a continuous range.
  const week = kind === "week" ? weekDays(date, weekStartsOn) : null;
  const getDayProps = week
    ? (day: string) => {
        const idx = week.indexOf(day);
        if (idx < 0 || day === date) {
          return {};
        }
        const endRadius = "calc(0.5rem * var(--mantine-scale))";
        return {
          style: {
            backgroundColor: WEEK_TINT,
            borderTopLeftRadius: idx === 0 ? endRadius : undefined,
            borderBottomLeftRadius: idx === 0 ? endRadius : undefined,
            borderTopRightRadius: idx === 6 ? endRadius : undefined,
            borderBottomRightRadius: idx === 6 ? endRadius : undefined,
          },
        };
      }
    : undefined;

  // The modal zooms out of / shrinks back into the trigger button (the app's
  // standard grow/shrink animation; mirror the filter dialog).
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  const contentWidth = modalContentWidth(viewport, isNarrow ? 300 : isDesktop ? 440 : 380);
  const transitionProps = {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: { opacity: 0, transform: `scale(${scaleFromRect(originRect, contentWidth)})` },
      common: { transformOrigin: transformOriginFromRect(originRect, viewport, "center") },
      transitionProperty: "transform, opacity",
    },
    duration: MOTION.modalZoom,
    exitDuration: MOTION.modalZoomExit,
    timingFunction: "cubic-bezier(0.3, 1.2, 0.4, 1)",
  } as const;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
      transitionProps={transitionProps}
    >
      {kind === "month" ? (
        <Box style={{ display: "flex", justifyContent: "center" }}>
          {/* MonthPicker reads `firstDayOfWeek` from the DatesProvider context
              (it is not a direct prop). */}
          <DatesProvider settings={{ firstDayOfWeek: firstDayOfWeek(weekStartsOn) }}>
            <MonthPicker
              defaultDate={`${date}-01`}
              onChange={(value) => {
                const picked = value ? dayjs(value) : null;
                if (!picked) {
                  return;
                }
                onPick(picked.format("YYYY-MM"));
                onClose();
              }}
            />
          </DatesProvider>
        </Box>
      ) : (
        <MobileMonthView
          date={pickerDate}
          firstDayOfWeek={firstDayOfWeek(weekStartsOn)}
          selectedDate={date}
          getDayProps={getDayProps}
          onDayClick={(picked) => {
            onPick(picked);
            onClose();
          }}
          renderHeader={({ date: displayedDate }) => (
            <>
              {/* 43px month chevrons: a roomier target inside the modal than the
                  36px page date-nav chevrons. */}
              <ActionIcon
                variant="subtle"
                size={43}
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
              >
                <IconChevronLeft size={18} />
              </ActionIcon>
              <Text fw={600} size="sm">
                {dayjs(displayedDate).format("MMMM YYYY")}
              </Text>
              <ActionIcon
                variant="subtle"
                size={43}
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
              >
                <IconChevronRight size={18} />
              </ActionIcon>
            </>
          )}
          styles={{ mobileMonthViewEventsList: { display: "none" } }}
        />
      )}
      <Button
        variant="light"
        fullWidth
        mt="md"
        onClick={() => {
          onToday();
          onClose();
        }}
      >
        Today
      </Button>
    </Modal>
  );
}
