"use client";

import { MultiSelect, type MultiSelectProps } from "@mantine/core";
import { useMemo } from "react";

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
 * calendar) and user calendar-access management. Intentionally not searchable
 * — departments are a short, always-visible list, so a plain (button-target)
 * MultiSelect that never raises the mobile keyboard is the right fit.
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
    <MultiSelect
      data={data}
      value={value}
      onChange={onChange}
      placeholder="Filter by calendar"
      clearable
      {...rest}
    />
  );
}
