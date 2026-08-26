"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Grid,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import { DatePickerInput, DateTimePicker } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";

import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";
import { UserSelectModal } from "@/components/UserSelectModal";
import {
  createEvent,
  updateEvent,
  type EventActionResult,
  type EventResultField,
} from "@/lib/events/actions";
import { subOneDay } from "@/lib/events/datetime";
import { clampOutOfCamp, type LocationPolicy } from "@/lib/events/locationPolicy";
import { eventRefFromCalendarEvent } from "@/lib/events/targets";
import {
  amPmSuffix,
  resolveTimeOption,
  TIME_OPTION_LABELS,
  type AmPm,
  type TimeOption,
} from "@/lib/events/timeOptions";
import { validateEventForm, type EventFormValues } from "@/lib/events/validate";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  formatEventTitle,
  type EventTitleInput,
  type EventTitlePerson,
} from "@/lib/settings/formatEventTitle";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";
import { buildUserGroups, selectionByGroup } from "@/lib/users/userSelect";
import { formatDateTime, naiveToDate } from "./clientDateTime";

interface EventTypeOption {
  name: string;
  shortname: string | null;
  timeOptions: TimeOption[];
  locationPolicy: LocationPolicy;
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
  /** Admin may create/edit events on behalf of any user (via the creator select). */
  isAdmin: boolean;
  inviteeDepartments: { id: string; name: string }[];
  inviteeUsers: InviteeUser[];
  onDone: () => void;
}

interface EventFormState extends EventFormValues {
  invitees: string[];
}

const AMPM_OPTIONS = [
  { label: "AM", value: "AM" },
  { label: "PM", value: "PM" },
];

/** The Out of Camp checkbox description, per the selected type's location policy. */
const OUT_OF_CAMP_DESCRIPTIONS: Record<LocationPolicy, string> = {
  in: "This event type takes place in camp only",
  out: "This event type takes place out of camp only",
  both: "In-camp events have no location; out of camp takes place at a location",
};

/** Wizard step ids for the staged event form. */
type StepId = "type" | "time" | "location" | "invitees" | "remarks" | "creator" | "review";

interface StepDef {
  id: StepId;
  /** Form fields that must validate cleanly before the step can be left. */
  fields: (keyof EventFormState)[];
}

/** The input steps shared by every user, in order. */
const BASE_STEPS: StepDef[] = [
  { id: "type", fields: [] },
  { id: "time", fields: ["start", "end", "startAmPm", "endAmPm"] },
  { id: "location", fields: [] },
  { id: "invitees", fields: [] },
  { id: "remarks", fields: [] },
];

/** The full wizard walk: admins enter an optional "On behalf of" after
    Remarks (blank = themselves); everyone ends on a read-only review of
    everything entered so far. */
function buildSteps(isAdmin: boolean): StepDef[] {
  return [
    ...BASE_STEPS,
    ...(isAdmin ? [{ id: "creator", fields: [] } satisfies StepDef] : []),
    { id: "review", fields: [] },
  ];
}

/** Maps a server-reported error field to the wizard step that owns it. */
const STEP_BY_FIELD: Partial<Record<EventResultField, StepId>> = {
  title: "remarks",
  start: "time",
  end: "time",
  startAmPm: "time",
  endAmPm: "time",
  creatorId: "creator",
};

/** Section label of the flat department list inside the invitee badge picker. */
const PICKER_DEPARTMENTS_SECTION = "Departments";

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
  isAdmin,
  inviteeDepartments,
  inviteeUsers,
  onDone,
}: EventFormProps) {
  const isEdit = event !== null;
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);

  const form = useForm<EventFormState>({
    initialValues: buildInitialValues(),
    validate: (values) => validateEventForm(values),
    // Blur-validation only covers the getInputProps-bound fields (title,
    // location); the wizard's goNext already gates every other step.
    validateInputOnBlur: true,
  });

  // Commits the badge picker draft into the form: the Departments section
  // yields department ids, every other section yields user ids. Previously
  // selected ids that no longer appear in the picker (e.g. now-inactive users)
  // are kept so editing can't silently drop them, and the locked creator is
  // kept first — the same guarantee the old multi-select's onChange had.
  function applyInviteePicker(values: Record<string, string[]>) {
    const known = new Set(Object.values(values).flat());
    const { userIds: previousUserIds, departmentIds: previousDepartmentIds } =
      splitInvitees(form.values.invitees);
    const departmentIds = [
      ...new Set([
        ...(values[PICKER_DEPARTMENTS_SECTION] ?? []),
        ...previousDepartmentIds.filter((id) => !known.has(id)),
      ]),
    ];
    const pickedUserIds = Object.keys(values)
      .filter((label) => label !== PICKER_DEPARTMENTS_SECTION)
      .flatMap((label) => values[label] ?? []);
    const uniqueUserIds = [
      ...new Set([...pickedUserIds, ...previousUserIds.filter((id) => !known.has(id))]),
    ];
    const userIds = form.values.creatorId
      ? [form.values.creatorId, ...uniqueUserIds.filter((id) => id !== form.values.creatorId)]
      : uniqueUserIds;
    form.setFieldValue("invitees", [
      ...departmentIds.map((id) => `dept:${id}`),
      ...userIds.map((id) => `user:${id}`),
    ]);
  }

  function buildInitialValues(): EventFormState {
    if (event) {
      const allDay = event.payload.allDay;
      const selectedType = eventTypes.find((type) => type.name === event.payload.eventType) ?? null;
      const allowed: TimeOption[] = selectedType ? selectedType.timeOptions : ["range"];
      const timeOption = resolveTimeOption(allowed, event.payload.timeOption);
      // Clamp the stored Out of Camp flag against the type's location policy
      // in case the policy tightened since the event was last edited.
      const clamped = clampOutOfCamp(
        selectedType ? selectedType.locationPolicy : "both",
        event.payload.outOfCamp,
        event.payload.location,
      );
      return {
        // Prefill the raw (pre-template) description when the notes block has
        // it, so editing never re-types the rendered calendar title.
        title: event.payload.rawTitle ?? (event.title === "(no title)" ? "" : event.title),
        timeOption,
        // Prefill any half-day markers stored in the notes (legacy full-day
        // events may carry them); AM→PM keeps plain spans marker-free.
        startAmPm: event.payload.startAmPm ?? "AM",
        endAmPm: event.payload.endAmPm ?? "PM",
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
        outOfCamp: clamped.outOfCamp,
        location: clamped.location,
      };
    }
    return {
      title: "",
      timeOption: "range",
      startAmPm: "AM",
      endAmPm: "PM",
      start: `${defaultDate} 09:00:00`,
      end: `${defaultDate} 10:00:00`,
      eventType: "",
      // Admins pick who the event is on behalf of; regular users create as
      // themselves (their own id is always locked as an invitee).
      creatorId: isAdmin ? "" : currentUser,
      inviteeUserIds: [],
      inviteeDepartments: [],
      invitees: isAdmin ? [] : currentUser ? [`user:${currentUser}`] : [],
      outOfCamp: false,
      location: "",
    };
  }

  // Badge picker content: a flat Departments section plus one user section per
  // department (No department last), built from the same props the old
  // multi-select used. Badges show the plain name — the section header already
  // carries the department — so the search haystack only adds the shortname
  // (section-label matching still finds whole departments).
  const inviteePickerGroups = useMemo(
    () => [
      ...(inviteeDepartments.length > 0
        ? [
            {
              label: PICKER_DEPARTMENTS_SECTION,
              options: inviteeDepartments.map((dept) => ({ id: dept.id, label: dept.name })),
            },
          ]
        : []),
      ...buildUserGroups(
        inviteeUsers.map((user) => ({
          id: user.id,
          label: user.name,
          department: user.departmentName,
          search: user.shortname || undefined,
        })),
      ),
    ],
    [inviteeDepartments, inviteeUsers],
  );

  // Seed the picker dialog draft from the current form value; re-derived every
  // render so the dialog always opens on the latest selection.
  const inviteePickerValues = useMemo(() => {
    const { userIds, departmentIds } = splitInvitees(form.values.invitees);
    return selectionByGroup(inviteePickerGroups, [...userIds, ...departmentIds]);
  }, [inviteePickerGroups, form.values.invitees]);

  const sortedEventTypes = useMemo(
    () => [...eventTypes].sort((a, b) => a.name.localeCompare(b.name)),
    [eventTypes],
  );

  const selectedType = sortedEventTypes.find((type) => type.name === form.values.eventType) ?? null;
  const allowedOptions: TimeOption[] = selectedType ? selectedType.timeOptions : ["range"];
  const effectiveTimeOption = resolveTimeOption(allowedOptions, form.values.timeOption);
  /** The selected type's location policy; untyped events are unrestricted. */
  const locationPolicy: LocationPolicy = selectedType ? selectedType.locationPolicy : "both";
  /** The effective Out of Camp flag + location after the policy is applied. */
  const effectiveOutOfCamp = clampOutOfCamp(
    locationPolicy,
    form.values.outOfCamp,
    form.values.location,
  );

  // Wizard state: a stepped walk through the form so the user only ever sees
  // one input group at a time. The step list depends on the role (admins get
  // the "On behalf of" step); it never changes mid-session, so memoize it.
  const steps = useMemo(() => buildSteps(isAdmin), [isAdmin]);
  const [step, setStep] = useState(0);
  const [inviteePickerOpen, setInviteePickerOpen] = useState(false);
  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;

  function goBack() {
    setStep((index) => Math.max(index - 1, 0));
  }

  // Enter in a single-line input must never submit the form: the browser's
  // implicit submit (or the mobile keyboard's return key) would otherwise
  // commit the event mid-typing. Only the explicit Create/Save button
  // submits. Implicit submission only applies to single-line inputs and
  // selects, not textareas — so the Remarks Textarea keeps its natural
  // newline behavior. This also covers the admin "On behalf of" select and
  // the invitee input. Component key handlers (e.g. the datetime pickers)
  // run before this bubbling handler, so only the native default — the
  // submit — is cancelled.
  function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") {
      return;
    }
    const tag = event.target instanceof HTMLElement ? event.target.tagName : "";
    if (tag === "INPUT" || tag === "SELECT") {
      event.preventDefault();
    }
  }

  function goNext() {
    // Step 1 needs a selected type before anything else makes sense.
    if (currentStep.id === "type") {
      if (!form.values.eventType) {
        form.setFieldError("eventType", "Select an event type");
        return;
      }
      form.clearFieldError("eventType");
    } else if (currentStep.fields.some((field) => form.validateField(field).hasError)) {
      return;
    }
    setStep((index) => Math.min(index + 1, steps.length - 1));
  }

  function switchTimeOption(option: TimeOption) {
    form.setFieldValue("timeOption", option);
    if (option !== "range") {
      if (form.values.start) {
        form.setFieldValue("start", `${form.values.start.slice(0, 10)} 00:00:00`);
      }
      if (form.values.end) {
        form.setFieldValue("end", `${form.values.end.slice(0, 10)} 00:00:00`);
      }
    }
    if (option === "half") {
      // Default to an AM→PM span (a mixed span renders with no title marker).
      if (!form.values.startAmPm) {
        form.setFieldValue("startAmPm", "AM");
      }
      if (!form.values.endAmPm) {
        form.setFieldValue("endAmPm", "PM");
      }
    }
  }

  function handleEventTypeChange(value: string | null) {
    const name = value ?? "";
    form.setFieldValue("eventType", name);
    if (name) {
      form.clearFieldError("eventType");
    }
    const type = eventTypes.find((entry) => entry.name === name);
    const allowed: TimeOption[] = type ? type.timeOptions : ["range"];
    if (!allowed.includes(form.values.timeOption)) {
      switchTimeOption(allowed[0]);
    }
    // Re-clamp the Out of Camp flag and location against the new type's
    // location policy (an "in" or "out" type clears the location, and "out"
    // additionally forces the flag on).
    const clamped = clampOutOfCamp(
      type ? type.locationPolicy : "both",
      form.values.outOfCamp,
      form.values.location,
    );
    form.setFieldValue("outOfCamp", clamped.outOfCamp);
    form.setFieldValue("location", clamped.location);
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
  // The currently selected attendees, for the invitee step's summary badges
  // and the badge picker's draft seeding.
  const selectedInvitees = splitInvitees(form.values.invitees);

  // "On behalf of" is optional: a blank select means the acting user, who is
  // always invited (mirroring the server's withSelfCreator normalization).
  // Preview and review derive their people from this effective list, so
  // {people} tokens match exactly what gets written.
  const effectiveCreatorId = form.values.creatorId || currentUser;
  const effectiveInvitees = [
    ...new Set([
      ...(effectiveCreatorId ? [`user:${effectiveCreatorId}`] : []),
      ...form.values.invitees,
    ]),
  ];

  // Live rendering of the exact title the server will write to Google, so the
  // user sees the final calendar summary (template tokens + AM/PM suffix)
  // before submitting.
  const previewTitle = (() => {
    const people: EventTitlePerson[] = effectiveInvitees
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
      location: effectiveOutOfCamp.location,
    };
    const base = formatEventTitle(input, eventTitleTemplate) || form.values.title.trim();
    const amPm = amPmSuffix(form.values.startAmPm, form.values.endAmPm);
    // Matches the server: an empty title gets no bare "(AM)" suffix.
    return base && effectiveTimeOption === "half" && amPm ? `${base} (${amPm})` : base;
  })();

  // Review-step display values — resolved from the same effective state the
  // submit payload uses, so what the user reviews is exactly what gets saved.
  // The effective owner is shown in the "On behalf of" row (or is the acting
  // user themselves), so keep them out of the invited-attendee list.
  const reviewPeople = [
    ...new Set(
      effectiveInvitees
        .filter((value) => value.startsWith("user:"))
        .filter((value) => value !== `user:${effectiveCreatorId}`)
        .map((value) => peopleById[value.slice("user:".length)]?.fqn)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const reviewDepartments = [
    ...new Set(
      form.values.invitees
        .filter((value) => value.startsWith("dept:"))
        .map((value) => departmentNames[value.slice("dept:".length)])
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  // The review always shows the effective owner (blank select = acting user).
  const creatorName = peopleById[effectiveCreatorId]?.fqn ?? null;
  const whenText = (() => {
    if (!form.values.start || !form.values.end) {
      return "";
    }
    if (effectiveTimeOption !== "range") {
      const startText = formatDateTime(form.values.start, true);
      // The form stores the inclusive last day; the review shows it as-is
      // (the exclusive-day expansion happens only on the Google write).
      const endText = formatDateTime(`${form.values.end.slice(0, 10)} 00:00:00`, true);
      // Mirrors the audit rendering: markers by presence, folded when mixed.
      const startMarker =
        effectiveTimeOption === "half" && form.values.startAmPm
          ? ` (${form.values.startAmPm})`
          : "";
      const endMarker =
        effectiveTimeOption === "half" && form.values.endAmPm ? ` (${form.values.endAmPm})` : "";
      if (!endText || endText === startText) {
        if (
          effectiveTimeOption === "half" &&
          form.values.startAmPm &&
          form.values.endAmPm &&
          form.values.startAmPm !== form.values.endAmPm
        ) {
          return `${startText} (${form.values.startAmPm}\u2013${form.values.endAmPm})`;
        }
        return `${startText}${startMarker}`;
      }
      return `${startText}${startMarker} \u2013 ${endText}${endMarker}`;
    }
    return `${formatDateTime(form.values.start, false)} – ${formatDateTime(form.values.end, false)}`;
  })();

  const onSubmit = form.onSubmit(
    async (values) => {
      // The submit button only renders on the last step; guard against
      // implicit form submission (e.g. Enter in a textbox) from earlier steps.
      if (!isLastStep) {
        return;
      }
      const { invitees, ...rest } = values;
      const { userIds, departmentIds } = splitInvitees(invitees);
      const payload: EventFormValues = {
        ...rest,
        timeOption: effectiveTimeOption,
        startAmPm: effectiveTimeOption === "half" ? rest.startAmPm || "AM" : "",
        endAmPm: effectiveTimeOption === "half" ? rest.endAmPm || "PM" : "",
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
        const failedField = result.field;
        form.setFieldError(failedField, result.error);
        // Land the user on the step that owns the failing field.
        const target = steps.findIndex((s) => s.id === STEP_BY_FIELD[failedField]);
        if (target >= 0) {
          setStep(target);
        }
      }
      notifications.show({ color: "red", message: result.error });
    },
    // Client-side failure on the final submit (e.g. end before start): toast,
    // and scroll the first invalid field into view when it is on this step.
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  const showTabs = allowedOptions.length > 1;

  const timeFields = (option: TimeOption) => {
    // Only Half Day carries half-of-day markers; Full Day is a plain range.
    const showAmPm = option === "half";
    const startField =
      option === "range" ? (
        <DateTimePicker
          label="Start time"
          value={naiveToDate(form.values.start)}
          onChange={(value) => form.setFieldValue("start", value ?? "")}
          valueFormat="YYYY-MM-DD HH:mm"
          error={form.errors.start}
        />
      ) : (
        <>
          <DatePickerInput
            label="Start date"
            value={naiveToDate(form.values.start)}
            onChange={(value) => form.setFieldValue("start", value ? `${value} 00:00:00` : "")}
            error={form.errors.start}
          />
          {showAmPm && (
            <Stack gap={4}>
              <SegmentedControl
                aria-label="Start AM or PM"
                data={AMPM_OPTIONS}
                value={form.values.startAmPm || undefined}
                onChange={(value) => form.setFieldValue("startAmPm", value as AmPm)}
              />
              {form.errors.startAmPm && (
                <Text size="xs" c="red">
                  {form.errors.startAmPm}
                </Text>
              )}
            </Stack>
          )}
        </>
      );
    const endField =
      option === "range" ? (
        <DateTimePicker
          label="End time"
          value={naiveToDate(form.values.end)}
          onChange={(value) => form.setFieldValue("end", value ?? "")}
          valueFormat="YYYY-MM-DD HH:mm"
          error={form.errors.end}
        />
      ) : (
        <>
          <DatePickerInput
            label="End date"
            value={naiveToDate(form.values.end)}
            onChange={(value) => form.setFieldValue("end", value ? `${value} 00:00:00` : "")}
            error={form.errors.end}
          />
          {showAmPm && (
            <Stack gap={4}>
              <SegmentedControl
                aria-label="End AM or PM"
                data={AMPM_OPTIONS}
                value={form.values.endAmPm || undefined}
                onChange={(value) => form.setFieldValue("endAmPm", value as AmPm)}
              />
              {form.errors.endAmPm && (
                <Text size="xs" c="red">
                  {form.errors.endAmPm}
                </Text>
              )}
            </Stack>
          )}
        </>
      );
    // The modal is wide enough at lg for start/end side by side.
    if (isDesktop) {
      return (
        <Grid gap="sm">
          <Grid.Col span={6}>{startField}</Grid.Col>
          <Grid.Col span={6}>{endField}</Grid.Col>
        </Grid>
      );
    }
    return (
      <>
        {startField}
        {endField}
      </>
    );
  };

  return (
    <form onSubmit={onSubmit} onKeyDown={handleFormKeyDown}>
      <div
        tabIndex={-1}
        data-autofocus
        aria-hidden="true"
        style={{ position: "fixed", top: 0, left: 0, opacity: 0, pointerEvents: "none" }}
      />
      <Stack gap="sm">
        {currentStep.id === "type" && (
          <Stack gap="xs">
            {sortedEventTypes.length === 0 ? (
              <Text size="sm" c="dimmed">
                No event types
              </Text>
            ) : (
              <Group gap={6} wrap="wrap">
                {sortedEventTypes.map((type) => {
                  const selected = type.name === form.values.eventType;
                  return (
                    <Badge
                      key={type.name}
                      variant={selected ? "filled" : "light"}
                      size="lg"
                      style={{ height: "calc(var(--badge-height-lg) * 1.5)", cursor: "pointer" }}
                      onClick={() => handleEventTypeChange(selected ? null : type.name)}
                    >
                      {type.name}
                    </Badge>
                  );
                })}
              </Group>
            )}
            {form.errors.eventType && (
              <Text size="xs" c="red">
                {form.errors.eventType}
              </Text>
            )}
          </Stack>
        )}

        {currentStep.id === "time" &&
          (showTabs ? (
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
          ))}

        {currentStep.id === "location" && (
          <Stack>
            <Checkbox
              label="Out of Camp"
              description={OUT_OF_CAMP_DESCRIPTIONS[locationPolicy]}
              checked={effectiveOutOfCamp.outOfCamp}
              disabled={locationPolicy !== "both"}
              onChange={(checkedEvent) => {
                const next = checkedEvent.currentTarget.checked;
                form.setFieldValue("outOfCamp", next);
                // Clear location when switching to in-camp (unchecked).
                // Keep location when switching to out-of-camp so user can specify where.
                if (!next) {
                  form.setFieldValue("location", "");
                }
              }}
            />
            <TextInput
              label="Location"
              placeholder="Where the event takes place"
              {...form.getInputProps("location")}
              disabled={!effectiveOutOfCamp.outOfCamp || locationPolicy === "in"}
            />
          </Stack>
        )}

        {currentStep.id === "invitees" &&
          (inviteePickerGroups.length > 0 ? (
            <Stack gap="xs">
              <Group justify="space-between" align="center" gap="xs">
                <Text fw={600} size="sm">
                  Invited Attendees
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => setInviteePickerOpen(true)}
                >
                  Select
                </Button>
              </Group>
              <Text size="xs" c="dimmed">
                A copy of the event is created in each tagged person&apos;s department and in each
                tagged department
              </Text>
              {(selectedInvitees.userIds.length > 0 || selectedInvitees.departmentIds.length > 0) && (
                <Group gap={6} wrap="wrap" align="start">
                  {selectedInvitees.userIds.map((id) => {
                    const person = peopleById[id];
                    if (!person) {
                      return null;
                    }
                    return (
                      <Badge
                        key={id}
                        variant="light"
                        color={id === form.values.creatorId ? "brand" : undefined}
                      >
                        {person.full}
                      </Badge>
                    );
                  })}
                  {selectedInvitees.departmentIds.map((id) =>
                    departmentNames[id] ? (
                      <Badge key={id} variant="light" color="accent">
                        {departmentNames[id]}
                      </Badge>
                    ) : null,
                  )}
                </Group>
              )}
              <UserSelectModal
                opened={inviteePickerOpen}
                onClose={() => setInviteePickerOpen(false)}
                groups={inviteePickerGroups}
                values={inviteePickerValues}
                onConfirm={applyInviteePicker}
                confirmLabel="Select"
                zIndex={300}
              />
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              No active users or departments to tag yet.
            </Text>
          ))}

        {currentStep.id === "remarks" && (
          <Textarea
            label="Remarks"
            description="Optional — the calendar title is rendered from the title template"
            placeholder="Add remarks"
            autosize
            minRows={2}
            maxRows={4}
            style={{ resize: "none" }}
            {...form.getInputProps("title")}
          />
        )}

        {/* Admins only, after Remarks: who this event is recorded as created
            or edited by. Optional — leaving it blank means the event belongs
            to the acting admin. Picking a user keeps the invitee chips in sync
            (the creator is always an invitee, mirroring the server's
            withSelfCreator normalization); the review step below reflects the
            effective owner. */}
        {currentStep.id === "creator" && (
          <NoKeyboardSelect
            label="On behalf of"
            description="Optional — leave empty to create or edit this event as yourself"
            placeholder="Yourself"
            data={inviteeUsers.map((user) => ({ value: user.id, label: user.displayName }))}
            value={form.values.creatorId || null}
            onChange={(value) => {
              const next = value ?? "";
              const previous = form.values.creatorId;
              const invitees = previous
                ? form.values.invitees.filter((entry) => `${entry}` !== `user:${previous}`)
                : [...form.values.invitees];
              form.setFieldValue("creatorId", next);
              form.setFieldValue(
                "invitees",
                next ? [...new Set([...invitees, `user:${next}`])] : invitees,
              );
            }}
            error={form.errors.creatorId}
            searchable
          />
        )}

        {/* Last step: a read-only review of everything entered. The calendar
            preview lives here — it renders the exact title the server will
            write to Google. Submitting commits the event. */}
        {currentStep.id === "review" && (
          <Stack gap="sm">
            <Paper withBorder p="sm">
              <Stack gap={4}>
                <Text size="sm" fw={500} c="accent.6" tt="uppercase">
                  Calendar preview
                </Text>
                <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
                  {previewTitle || "—"}
                </Text>
              </Stack>
            </Paper>

            <Stack gap={4}>
              <Text size="xs" c="dimmed" fw={600}>
                When
              </Text>
              <Text size="sm">{whenText || "—"}</Text>
            </Stack>

            <Stack gap={4}>
              <Text size="xs" c="dimmed" fw={600}>
                Location
              </Text>
              <Group gap={6} wrap="wrap">
                <Badge variant="light" color={effectiveOutOfCamp.outOfCamp ? "yellow" : "green"}>
                  {effectiveOutOfCamp.outOfCamp ? "Out of Camp" : "In Camp"}
                </Badge>
                {effectiveOutOfCamp.location && (
                  <Text size="sm" c="dimmed">
                    {effectiveOutOfCamp.location}
                  </Text>
                )}
              </Group>
            </Stack>

            <Stack gap={4}>
              <Text size="xs" c="dimmed" fw={600}>
                Event Type
              </Text>
              <Group gap={6} wrap="wrap">
                {form.values.eventType ? (
                  <Badge variant="light">{form.values.eventType}</Badge>
                ) : (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                )}
              </Group>
            </Stack>

            {isAdmin && (
              <Stack gap={4}>
                <Text size="xs" c="dimmed" fw={600}>
                  On behalf of
                </Text>
                <Group gap={6} wrap="wrap">
                  {creatorName ? (
                    <Badge variant="light" color="brand">
                      {creatorName}
                    </Badge>
                  ) : (
                    <Text size="sm">Yourself</Text>
                  )}
                </Group>
              </Stack>
            )}

            {reviewPeople.length > 0 && (
              <Stack gap={4}>
                <Text size="xs" c="dimmed" fw={600}>
                  Invited Attendees
                </Text>
                <Group gap={6} wrap="wrap">
                  {reviewPeople.map((name) => (
                    <Badge key={name} variant="light">
                      {name}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            )}

            {reviewDepartments.length > 0 && (
              <Stack gap={4}>
                <Text size="xs" c="dimmed" fw={600}>
                  Departments
                </Text>
                <Group gap={6} wrap="wrap">
                  {reviewDepartments.map((name) => (
                    <Badge key={name} variant="light" color="accent">
                      {name}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            )}

            <Stack gap={4}>
              <Text size="xs" c="dimmed" fw={600}>
                Remarks
              </Text>
              <Text size="sm" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                {form.values.title.trim() || "—"}
              </Text>
            </Stack>
          </Stack>
        )}

        <Group justify={step === 0 ? "flex-end" : "space-between"} gap="sm">
          {step > 0 && (
            <Button
              variant="subtle"
              color="gray"
              onClick={goBack}
              leftSection={<IconChevronLeft size={16} />}
              style={{ flexShrink: 0 }}
            >
              Back
            </Button>
          )}
          {isLastStep ? (
            <Button
              key="submit"
              type="submit"
              loading={form.submitting}
              loaderProps={BUTTON_LOADER_PROPS}
              style={step > 0 ? { flexGrow: 1 } : undefined}
            >
              {isEdit ? "Save changes" : "Create event"}
            </Button>
          ) : (
            <Button
              key="next"
              fullWidth={step === 0}
              onClick={(event) => {
                // The Next button and the Create/Save button are the same DOM
                // node (one conditional, React reuses the element). Without
                // this, the step-advance click leaves the button `type="submit"`
                // by the time the browser runs the click's default action, so
                // advancing into the Remarks step submits the form. A canceled
                // click never activates the button, and the distinct keys force
                // React to mount a fresh node (never re-typing the clicked one).
                event.preventDefault();
                goNext();
              }}
              rightSection={<IconChevronRight size={16} />}
              style={step > 0 ? { flexGrow: 1 } : undefined}
            >
              Next
            </Button>
          )}
        </Group>
      </Stack>
    </form>
  );
}
