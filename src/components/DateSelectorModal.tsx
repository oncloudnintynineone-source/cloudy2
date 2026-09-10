"use client";

import dayjs from "dayjs";
import { useState } from "react";
import { ActionIcon, Modal, Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { MobileMonthView } from "@mantine/schedule";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";

interface DateSelectorModalProps {
  opened: boolean;
  date: string;
  onPick: (date: string) => void;
  onClose: () => void;
}

export function DateSelectorModal({ opened, date, onPick, onClose }: DateSelectorModalProps) {
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

  const shiftMonth = (delta: number) =>
    setPickerDate(dayjs(pickerDate).add(delta, "month").format("YYYY-MM-DD"));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Select date"
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
    >
      <MobileMonthView
        date={pickerDate}
        selectedDate={date}
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
    </Modal>
  );
}
