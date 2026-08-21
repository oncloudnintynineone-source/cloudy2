"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { DatePickerInput, DateTimePicker } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import { NoKeyboardMultiSelect, NoKeyboardSelect } from "@/components/NoKeyboardSelect";
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
import { naiveToDate } from "./clientDateTime";

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
type StepId = "type" | "time" | "location" | "invitees" | "remarks";

interface StepDef {
  id: StepId;
  label: string;
  /** Form fields that must validate cleanly before the step can be left. */
  fields: (keyof EventFormState)[];
}

/** The wizard steps, in order (admins additionally pin the "On behalf of"
    select above the step content). */
const STEPS: StepDef[] = [
  { id: "type", label: "Event type", fields: [] },
  { id: "time", label: "Timestamp", fields: ["start", "end", "startAmPm", "endAmPm"] },
  { id: "location", label: "Location", fields: [] },
  { id: "invitees", label: "Invitees", fields: [] },
  { id: "remarks", label: "Remarks", fields: [] },
];

/** Maps a server-reported error field to the wizard step that owns it. */
const STEP_BY_FIELD: Partial<Record<EventResultField, StepId>> = {
  title: "remarks",
  start: "time",
  end: "time",
  startAmPm: "time",
  endAmPm: "time",
};

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

  const form = useForm<EventFormState>({
    initialValues: buildInitialValues(),
    validate: (values) => validateEventForm(values, { requireCreator: isAdmin }),
  });

  // The event creator is always an invitee; the select value holding them is
  // re-added on every change so the chip can't be cleared or deselected. For
  // regular users the creator is their own (locked) id; admins can change it.
  const lockedUserValue = form.values.creatorId ? `user:${form.values.creatorId}` : null;

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
        // Legacy full-day events carry no indicators; defaulting to AM→PM
        // keeps them rendering as a plain full day (no title suffix).
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
  // one input group at a time.
  const [step, setStep] = useState(0);
  const currentStep = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

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
    setStep((index) => Math.min(index + 1, STEPS.length - 1));
  }

  function switchTimeOption(option: TimeOption) {
    form.setFieldValue("timeOption", option);
    if (option === "full") {
      if (form.values.start) {
        form.setFieldValue("start", `${form.values.start.slice(0, 10)} 00:00:00`);
      }
      if (form.values.end) {
        form.setFieldValue("end", `${form.values.end.slice(0, 10)} 00:00:00`);
      }
      // Default to a plain full-day span (no title suffix) on entry.
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
      location: effectiveOutOfCamp.location,
    };
    const base = formatEventTitle(input, eventTitleTemplate) || form.values.title.trim();
    const amPm = amPmSuffix(form.values.startAmPm, form.values.endAmPm);
    // Matches the server: an empty title gets no bare "(AM)" suffix.
    return base && effectiveTimeOption === "full" && amPm ? `${base} (${amPm})` : base;
  })();

  const onSubmit = form.onSubmit(async (values) => {
    // The submit button only renders on the last step; guard against implicit
    // form submission (e.g. Enter in a textbox) from earlier steps.
    if (!isLastStep) {
      return;
    }
    const { invitees, ...rest } = values;
    const { userIds, departmentIds } = splitInvitees(invitees);
    const payload: EventFormValues = {
      ...rest,
      timeOption: effectiveTimeOption,
      startAmPm: effectiveTimeOption === "full" ? rest.startAmPm || "AM" : "",
      endAmPm: effectiveTimeOption === "full" ? rest.endAmPm || "PM" : "",
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
      const target = STEPS.findIndex((s) => s.id === STEP_BY_FIELD[failedField]);
      if (target >= 0) {
        setStep(target);
      }
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
        <DatePickerInput
          label="End date"
          value={naiveToDate(form.values.end)}
          onChange={(value) => form.setFieldValue("end", value ? `${value} 00:00:00` : "")}
          error={form.errors.end}
        />
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
      </>
    );

  return (
    <form onSubmit={onSubmit} onKeyDown={handleFormKeyDown}>
      <div
        tabIndex={-1}
        data-autofocus
        aria-hidden="true"
        style={{ position: "fixed", top: 0, left: 0, opacity: 0, pointerEvents: "none" }}
      />
      <Stack gap="sm">
        {/* Compact wizard indicator: dots for progress (tap a filled dot to
            jump back) plus the current step label. */}
        <Stack gap={6} align="center">
          <Group gap={6} justify="center">
            {STEPS.map((s, index) => {
              const done = index < step;
              const current = index === step;
              return (
                <UnstyledButton
                  key={s.id}
                  type="button"
                  disabled={!done}
                  aria-label={`Go to step ${index + 1}: ${s.label}`}
                  onClick={() => setStep(index)}
                  style={{
                    width: current ? 10 : 8,
                    height: current ? 10 : 8,
                    borderRadius: "50%",
                    backgroundColor:
                      done || current ? "var(--mantine-color-brand-6)" : "var(--mantine-color-gray-3)",
                    boxShadow: current ? `0 0 0 2px var(--mantine-color-brand-1)` : undefined,
                  }}
                />
              );
            })}
          </Group>
          <Text size="xs" c="dimmed" ta="center">
            {step + 1} of {STEPS.length} · {currentStep.label}
          </Text>
        </Stack>

        {/* Pinned for admins: who the event is on behalf of, always in view
            (sticks to the top of the scrolling body). */}
        {isAdmin && (
          <Box
            style={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              paddingBottom: 8,
              backgroundColor: "var(--mantine-color-body)",
            }}
          >
            <NoKeyboardSelect
              label="On behalf of"
              description="Create or edit this event as another user"
              placeholder="Select a user"
              data={inviteeUsers.map((user) => ({ value: user.id, label: user.displayName }))}
              value={form.values.creatorId || null}
              onChange={(value) => {
                const next = value ?? "";
                const previous = form.values.creatorId;
                // The creator is always an invitee; keep the invitee chips and
                // the live preview in sync with the acting user (matching the
                // server's withCreatorInvited normalization).
                const invitees = form.values.invitees.filter(
                  (entry) => `${entry}` !== (previous ? `user:${previous}` : `${entry}`),
                );
                form.setFieldValue("creatorId", next);
                form.setFieldValue(
                  "invitees",
                  next ? [...new Set([...invitees, `user:${next}`])] : invitees,
                );
              }}
              error={form.errors.creatorId}
              searchable
              required
            />
          </Box>
        )}

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
          (inviteeData.length > 0 ? (
            <NoKeyboardMultiSelect
              label="Invitees"
              description="A copy of the event is created in each tagged person's department and in each tagged department"
              placeholder="My department only"
              data={inviteeData}
              value={form.values.invitees}
              onChange={(value) =>
                form.setFieldValue(
                  "invitees",
                  lockedUserValue ? [...new Set([lockedUserValue, ...value])] : value,
                )
              }
              searchable
              clearable
            />
          ) : (
            <Text size="sm" c="dimmed">
              No people or departments to tag — the event lands in your own department calendar.
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
