"use client";

import "@mantine/dates/styles.css";
import "@mantine/schedule/styles.css";
import dayjs from "dayjs";
import { useState } from "react";
import { ActionIcon, Box, Button, Text } from "@mantine/core";
import { DatesProvider, MonthPicker } from "@mantine/dates";
import { MobileMonthView } from "@mantine/schedule";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import { firstDayOfWeek, weekDays, type WeekStart } from "@/lib/events/datetime";

export type DateSelectorKind = "month" | "week" | "day";

interface DateSelectorModalBodyProps {
  /** Picker flavor driven by the active dashboard view. */
  kind: DateSelectorKind;
  /** Anchor value: `YYYY-MM-DD` for day/week, `YYYY-MM` for month. */
  date: string;
  /** Called with `YYYY-MM-DD` (day/week) or `YYYY-MM` (month) when picked. */
  onPick: (value: string) => void;
  onToday: () => void;
  onClose: () => void;
  /** Which day the account's week starts on (default Monday). */
  weekStartsOn?: WeekStart;
}

const WEEK_TINT = "color-mix(in srgb, var(--mantine-primary-color-filled) 15%, transparent)";

/**
 * The month/week/day picker content. Split into its own chunk so the modal
 * chrome can animate out of the date trigger before the heavy
 * `@mantine/dates` / `@mantine/schedule` modules arrive
 * (docs/loading-transitions.md §1.15.1).
 */
export function DateSelectorModalBody({
  kind,
  date,
  onPick,
  onToday,
  onClose,
  weekStartsOn = "monday",
}: DateSelectorModalBodyProps) {
  // The body mounts fresh on every open, so this re-seeds the displayed month
  // from the current anchor automatically.
  const [pickerDate, setPickerDate] = useState(date);

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

  return (
    <>
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
    </>
  );
}
