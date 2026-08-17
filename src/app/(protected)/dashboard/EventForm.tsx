"use client";

import { useMemo } from "react";
import { Button, Group, MultiSelect, Select, Stack, Switch, TextInput } from "@mantine/core";
import { DatePickerInput, DateTimePicker } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { createEvent, updateEvent, type EventActionResult } from "@/lib/events/actions";
import { subOneDay } from "@/lib/events/datetime";
import { eventRefFromCalendarEvent } from "@/lib/events/targets";
import { validateEventForm, type EventFormValues } from "@/lib/events/validate";
import type { CalendarEvent } from "@/lib/events/queries";
import { naiveToDate } from "./clientDateTime";

interface EventFormProps {
  event: CalendarEvent | null;
  defaultDate: string;
  eventTypes: string[];
  /** Session user id; stored as the event creator on create. */
  currentUser: string;
  inviteeDepartments: { id: string; name: string }[];
  inviteeUsers: { id: string; name: string; departmentName: string | null; displayName: string }[];
  onDone: () => void;
}

interface EventFormState extends EventFormValues {
  invitees: string[];
}

/** Split the prefixed select values (`user:<id>` / `dept:<id>`) into the two notes fields. */
function splitInvitees(invitees: string[]): { userIds: string[]; departmentIds: string[] } {
  const userIds: string[] = [];
  const departmentIds: string[] = [];
  for (const value of invitees) {
    if (value.startsWith("user:")) {
      userIds.push(value.slice("user:".length));
    } else if (value.startsWith("dept:")) {
      departmentIds.push(value.slice("dept:".length));
    }
  }
  return { userIds, departmentIds };
}

export function EventForm({
  event,
  defaultDate,
  eventTypes,
  currentUser,
  inviteeDepartments,
  inviteeUsers,
  onDone,
}: EventFormProps) {
  const isEdit = event !== null;

  const form = useForm<EventFormState>({
    initialValues: buildInitialValues(),
    validate: (values) => validateEventForm(values),
  });

  function buildInitialValues(): EventFormState {
    if (event) {
      const allDay = event.payload.allDay;
      return {
        // Prefill the raw (pre-template) description when the notes block has
        // it, so editing never re-types the rendered calendar title.
        title: event.payload.rawTitle ?? (event.title === "(no title)" ? "" : event.title),
        allDay,
        start: event.start,
        end: allDay ? `${subOneDay(event.end.slice(0, 10))} 00:00:00` : event.end,
        eventType: event.payload.eventType ?? "",
        creatorId: event.payload.creatorId ?? "",
        inviteeUserIds: [],
        inviteeDepartments: [],
        invitees: [
          ...event.payload.inviteeDepartmentIds.map((id) => `dept:${id}`),
          ...event.payload.inviteeUserIds.map((id) => `user:${id}`),
        ],
      };
    }
    return {
      title: "",
      allDay: false,
      start: `${defaultDate} 09:00:00`,
      end: `${defaultDate} 10:00:00`,
      eventType: "",
      creatorId: currentUser,
      inviteeUserIds: [],
      inviteeDepartments: [],
      invitees: [],
    };
  }

  const inviteeData = useMemo(
    () => [
      ...(inviteeDepartments.length > 0
        ? [
            {
              group: "Departments",
              items: inviteeDepartments.map((dept) => ({
                value: `dept:${dept.id}`,
                label: dept.name,
              })),
            },
          ]
        : []),
      ...(inviteeUsers.length > 0
        ? [
            {
              group: "People",
              items: inviteeUsers.map((user) => ({
                value: `user:${user.id}`,
                label: user.displayName,
              })),
            },
          ]
        : []),
    ],
    [inviteeDepartments, inviteeUsers],
  );

  const onSubmit = form.onSubmit(async (values) => {
    const { invitees, ...rest } = values;
    const { userIds, departmentIds } = splitInvitees(invitees);
    const payload: EventFormValues = { ...rest, inviteeUserIds: userIds, inviteeDepartments: departmentIds };
    const result: EventActionResult = isEdit
      ? await updateEvent(eventRefFromCalendarEvent(event), payload)
      : await createEvent(payload);

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

        {inviteeData.length > 0 && (
          <MultiSelect
            label="Invitees"
            description="A copy of the event is created in each tagged person's department and in each tagged department"
            placeholder="My department only"
            data={inviteeData}
            value={form.values.invitees}
            onChange={(value) => form.setFieldValue("invitees", value)}
            searchable
            clearable
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
