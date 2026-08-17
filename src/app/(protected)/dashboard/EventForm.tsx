"use client";

import { useMemo } from "react";
import {
  Button,
  Group,
  MultiSelect,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput, DateTimePicker } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { createEvent, updateEvent, type EventActionResult } from "@/lib/events/actions";
import { subOneDay } from "@/lib/events/datetime";
import { eventRefFromCalendarEvent } from "@/lib/events/targets";
import {
  resolveTimeOption,
  TIME_OPTION_LABELS,
  type TimeOption,
} from "@/lib/events/timeOptions";
import { validateEventForm, type EventFormValues } from "@/lib/events/validate";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  formatEventTitle,
  type EventTitleInput,
  type EventTitlePerson,
} from "@/lib/settings/formatEventTitle";
import { naiveToDate } from "./clientDateTime";

interface EventTypeOption {
  name: string;
  shortname: string | null;
  timeOptions: TimeOption[];
}

interface InviteeUser {
  id: string;
  name: string;
  shortname: string | null;
  departmentName: string | null;
  displayName: string;
}

interface EventFormProps {
  event: CalendarEvent | null;
  defaultDate: string;
  eventTypes: EventTypeOption[];
  /** The admin-defined event title template, for the live calendar preview. */
  eventTitleTemplate: string;
  /** Session user id; stored as the event creator on create. */
  currentUser: string;
  inviteeDepartments: { id: string; name: string }[];
  inviteeUsers: InviteeUser[];
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
  eventTitleTemplate,
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
      const selectedType = eventTypes.find((type) => type.name === event.payload.eventType) ?? null;
      const allowed: TimeOption[] = selectedType ? selectedType.timeOptions : ["range"];
      const timeOption = resolveTimeOption(allowed, event.payload.timeOption);
      return {
        // Prefill the raw (pre-template) description when the notes block has
        // it, so editing never re-types the rendered calendar title.
        title: event.payload.rawTitle ?? (event.title === "(no title)" ? "" : event.title),
        timeOption,
        amPm: event.payload.timeOptionAmPm ?? (timeOption === "ampm" ? "AM" : ""),
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
      timeOption: "range",
      amPm: "",
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

  const selectedType = eventTypes.find((type) => type.name === form.values.eventType) ?? null;
  const allowedOptions: TimeOption[] = selectedType ? selectedType.timeOptions : ["range"];
  const effectiveTimeOption = resolveTimeOption(allowedOptions, form.values.timeOption);

  function switchTimeOption(option: TimeOption) {
    form.setFieldValue("timeOption", option);
    if (option !== "range") {
      if (form.values.start) {
        form.setFieldValue("start", `${form.values.start.slice(0, 10)} 00:00:00`);
      }
      if (form.values.end) {
        form.setFieldValue("end", `${form.values.end.slice(0, 10)} 00:00:00`);
      }
      if (option === "ampm" && !form.values.amPm) {
        form.setFieldValue("amPm", "AM");
      }
    }
  }

  function handleEventTypeChange(value: string | null) {
    const name = value ?? "";
    form.setFieldValue("eventType", name);
    const type = eventTypes.find((entry) => entry.name === name);
    const allowed: TimeOption[] = type ? type.timeOptions : ["range"];
    if (!allowed.includes(form.values.timeOption)) {
      switchTimeOption(allowed[0]);
    }
  }

  const peopleById = useMemo(
    () =>
      Object.fromEntries(
        inviteeUsers.map((user) => [
          user.id,
          {
            full: user.name,
            acronym: user.shortname || user.name,
            fqn: user.displayName,
          },
        ]),
      ),
    [inviteeUsers],
  );
  const departmentNames = useMemo(
    () => Object.fromEntries(inviteeDepartments.map((dept) => [dept.id, dept.name])),
    [inviteeDepartments],
  );

  // Live rendering of the exact title the server will write to Google, so the
  // user sees the final calendar summary (template tokens + AM/PM suffix)
  // before submitting.
  const previewTitle = (() => {
    const people: EventTitlePerson[] = form.values.invitees
      .filter((value) => value.startsWith("user:"))
      .map((value) => value.slice("user:".length))
      .map((id) => peopleById[id])
      .filter((person): person is EventTitlePerson => Boolean(person));
    const departments = form.values.invitees
      .filter((value) => value.startsWith("dept:"))
      .map((value) => value.slice("dept:".length))
      .map((id) => departmentNames[id])
      .filter((name): name is string => Boolean(name));
    const input: EventTitleInput = {
      description: form.values.title,
      eventType: selectedType
        ? { name: selectedType.name, acronym: selectedType.shortname || selectedType.name }
        : null,
      people,
      departments,
    };
    const base = formatEventTitle(input, eventTitleTemplate) || form.values.title;
    return effectiveTimeOption === "ampm" && form.values.amPm
      ? `${base} (${form.values.amPm})`
      : base;
  })();

  const onSubmit = form.onSubmit(async (values) => {
    const { invitees, ...rest } = values;
    const { userIds, departmentIds } = splitInvitees(invitees);
    const payload: EventFormValues = {
      ...rest,
      timeOption: effectiveTimeOption,
      amPm: effectiveTimeOption === "ampm" ? rest.amPm || "AM" : "",
      inviteeUserIds: userIds,
      inviteeDepartments: departmentIds,
    };
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

  const showTabs = allowedOptions.length > 1;

  const timeFields = (option: TimeOption) =>
    option === "range" ? (
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
    ) : (
      <>
        <DatePickerInput
          label="Start date"
          value={naiveToDate(form.values.start)}
          onChange={(value) => form.setFieldValue("start", value ? `${value} 00:00:00` : "")}
          error={form.errors.start}
        />
        <DatePickerInput
          label="End date"
          value={naiveToDate(form.values.end)}
          onChange={(value) => form.setFieldValue("end", value ? `${value} 00:00:00` : "")}
          error={form.errors.end}
        />
        {option === "ampm" && (
          <Stack gap={4}>
            <SegmentedControl
              aria-label="AM or PM"
              data={[
                { label: "AM", value: "AM" },
                { label: "PM", value: "PM" },
              ]}
              value={form.values.amPm || undefined}
              onChange={(value) => form.setFieldValue("amPm", value as "AM" | "PM")}
            />
            {form.errors.amPm && (
              <Text size="xs" c="red">
                {form.errors.amPm}
              </Text>
            )}
          </Stack>
        )}
      </>
    );

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

        <Select
          label="Event Type"
          placeholder="None"
          data={eventTypes.map((type) => ({ value: type.name, label: type.name }))}
          value={form.values.eventType || null}
          onChange={handleEventTypeChange}
          clearable
          searchable
        />

        {showTabs ? (
          <Tabs
            value={effectiveTimeOption}
            onChange={(value) => value && switchTimeOption(value as TimeOption)}
            aria-label="Time option"
          >
            <Tabs.List grow>
              {allowedOptions.map((option) => (
                <Tabs.Tab key={option} value={option}>
                  {TIME_OPTION_LABELS[option]}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            <Tabs.Panel value={effectiveTimeOption} pt="sm">
              <Stack>{timeFields(effectiveTimeOption)}</Stack>
            </Tabs.Panel>
          </Tabs>
        ) : (
          timeFields(effectiveTimeOption)
        )}

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

        <Paper withBorder p="sm">
          <Stack gap={4}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">
              Calendar preview
            </Text>
            <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
              {previewTitle || "—"}
            </Text>
          </Stack>
        </Paper>

        <Group justify="flex-end" mt="md">
          <Button type="submit" fullWidth>
            {isEdit ? "Save changes" : "Create event"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
