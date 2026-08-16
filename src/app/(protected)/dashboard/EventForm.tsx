"use client";

import { Button, Group, Select, Stack, Switch, TextInput } from "@mantine/core";
import { DatePickerInput, DateTimePicker } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { createEvent, updateEvent, type EventActionResult } from "@/lib/events/actions";
import { subOneDay } from "@/lib/events/datetime";
import { validateEventForm, type EventFormValues } from "@/lib/events/validate";
import type { CalendarEvent } from "@/lib/events/queries";
import { naiveToDate } from "./clientDateTime";

interface EventFormProps {
  event: CalendarEvent | null;
  defaultDate: string;
  calendars: { id: string; name: string }[];
  eventTypes: string[];
  isAdmin: boolean;
  initialCalendarId: string;
  onDone: () => void;
}

export function EventForm({
  event,
  defaultDate,
  calendars,
  eventTypes,
  isAdmin,
  initialCalendarId,
  onDone,
}: EventFormProps) {
  const isEdit = event !== null;

  const form = useForm<EventFormValues>({
    initialValues: buildInitialValues(),
    validate: (values) => validateEventForm(values),
  });

  function buildInitialValues(): EventFormValues {
    if (event) {
      const allDay = event.payload.allDay;
      return {
        title: event.title === "(no title)" ? "" : event.title,
        allDay,
        start: event.start,
        end: allDay ? `${subOneDay(event.end.slice(0, 10))} 00:00:00` : event.end,
        eventType: event.payload.eventType ?? "",
        calendarId: event.payload.calendarId,
      };
    }
    return {
      title: "",
      allDay: false,
      start: `${defaultDate} 09:00:00`,
      end: `${defaultDate} 10:00:00`,
      eventType: "",
      calendarId: initialCalendarId,
    };
  }

  const onSubmit = form.onSubmit(async (values) => {
    const result: EventActionResult = isEdit
      ? await updateEvent(event.payload.googleEventId, values)
      : await createEvent(values);

    if (result.ok) {
      notifications.show({
        color: "green",
        message: isEdit ? "Event updated" : "Event created",
      });
      onDone();
      return;
    }

    if (result.field) {
      form.setFieldError(result.field, result.error);
    }
    notifications.show({ color: "red", message: result.error });
  });

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput
          label="Event Description"
          required
          placeholder="Event title"
          data-autofocus
          {...form.getInputProps("title")}
        />

        <Switch
          label="All day"
          checked={form.values.allDay}
          onChange={(event) => {
            const allDay = event.currentTarget.checked;
            form.setFieldValue("allDay", allDay);
            if (allDay) {
              form.setFieldValue(
                "start",
                form.values.start ? `${form.values.start.slice(0, 10)} 00:00:00` : "",
              );
              form.setFieldValue(
                "end",
                form.values.end ? `${form.values.end.slice(0, 10)} 00:00:00` : "",
              );
            }
          }}
        />

        {form.values.allDay ? (
          <>
            <DatePickerInput
              label="Start date"
              value={naiveToDate(form.values.start)}
              onChange={(value) =>
                form.setFieldValue("start", value ? `${value} 00:00:00` : "")
              }
              error={form.errors.start}
            />
            <DatePickerInput
              label="End date"
              value={naiveToDate(form.values.end)}
              onChange={(value) =>
                form.setFieldValue("end", value ? `${value} 00:00:00` : "")
              }
              error={form.errors.end}
            />
          </>
        ) : (
          <>
            <DateTimePicker
              label="Start time"
              value={naiveToDate(form.values.start)}
              onChange={(value) => form.setFieldValue("start", value ?? "")}
              valueFormat="YYYY-MM-DD HH:mm"
              error={form.errors.start}
            />
            <DateTimePicker
              label="End time"
              value={naiveToDate(form.values.end)}
              onChange={(value) => form.setFieldValue("end", value ?? "")}
              valueFormat="YYYY-MM-DD HH:mm"
              error={form.errors.end}
            />
          </>
        )}

        <Select
          label="Event Type"
          placeholder="None"
          data={eventTypes.map((name) => ({ value: name, label: name }))}
          value={form.values.eventType || null}
          onChange={(value) => form.setFieldValue("eventType", value ?? "")}
          clearable
          searchable
        />

        {isAdmin && !isEdit && (
          <Select
            label="Calendar"
            required
            data={calendars.map((calendar) => ({ value: calendar.id, label: calendar.name }))}
            value={form.values.calendarId || null}
            onChange={(value) => form.setFieldValue("calendarId", value ?? "")}
            error={form.errors.calendarId}
            searchable
          />
        )}

        <Group justify="flex-end" mt="md">
          <Button type="submit" fullWidth>
            {isEdit ? "Save changes" : "Create event"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
