"use client";

import dayjs from "dayjs";
import { useState } from "react";
import { ActionIcon, Box, Button, Modal, Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { MonthPicker } from "@mantine/dates";
import { MobileMonthView } from "@mantine/schedule";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";
import { weekDays } from "@/lib/events/datetime";

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
}

const WEEK_TINT = "color-mix(in srgb, var(--mantine-primary-color-filled) 15%, transparent)";

export function DateSelectorModal({
  opened,
  kind,
  date,
  onPick,
  onToday,
  onClose,
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

  // Week picker: highlight the Monday-first week containing the anchor day.
  // `selectedDate` already fills the anchor's circle; the other six days get a
  // subtle brand tint (rounded on the leading/trailing ends) so the week reads
  // as a continuous range.
  const week = kind === "week" ? weekDays(date) : null;
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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
    >
      {kind === "month" ? (
        <Box style={{ display: "flex", justifyContent: "center" }}>
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
        </Box>
      ) : (
        <MobileMonthView
          date={pickerDate}
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
