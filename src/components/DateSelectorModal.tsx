"use client";

import dayjs from "dayjs";
import { useState } from "react";
import { ActionIcon, Modal, Text } from "@mantine/core";
import { MobileMonthView } from "@mantine/schedule";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

interface DateSelectorModalProps {
  opened: boolean;
  date: string;
  onPick: (date: string) => void;
  onClose: () => void;
}

export function DateSelectorModal({ opened, date, onPick, onClose }: DateSelectorModalProps) {
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
    <Modal opened={opened} onClose={onClose} title="Select date" centered size="sm">
      <MobileMonthView
        date={pickerDate}
        selectedDate={date}
        onDayClick={(picked) => {
          onPick(picked);
          onClose();
        }}
        renderHeader={({ date: displayedDate }) => (
          <>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              <IconChevronLeft size={16} />
            </ActionIcon>
            <Text fw={600} size="sm">
              {dayjs(displayedDate).format("MMMM YYYY")}
            </Text>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
            >
              <IconChevronRight size={16} />
            </ActionIcon>
          </>
        )}
        styles={{ mobileMonthViewEventsList: { display: "none" } }}
      />
    </Modal>
  );
}
