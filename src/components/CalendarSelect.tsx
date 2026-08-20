"use client";

import { type MultiSelectProps } from "@mantine/core";
import { useMemo } from "react";

import { NoKeyboardMultiSelect } from "@/components/NoKeyboardSelect";

export interface CalendarOption {
  value: string;
  label: string;
}

interface CalendarSelectProps
  extends Omit<MultiSelectProps, "data" | "onChange" | "value"> {
  calendars: CalendarOption[];
  value: string[];
  onChange: (value: string[]) => void;
}

/**
 * Reusable calendar selection dropdown. Used for dashboard filters (filter by
 * calendar) and user calendar-access management. The target input never
 * raises the mobile virtual keyboard until the dropdown is open (see
 * NoKeyboardMultiSelect).
 */
export function CalendarSelect({
  calendars,
  value,
  onChange,
  ...rest
}: CalendarSelectProps) {
  const data = useMemo(
    () => calendars.map((c) => ({ value: c.value, label: c.label })),
    [calendars],
  );

  return (
    <NoKeyboardMultiSelect
      data={data}
      value={value}
      onChange={onChange}
      placeholder="Filter by calendar"
      searchable
      clearable
      {...rest}
    />
  );
}
