"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Stepper,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import { DatePickerInput, TimePicker } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import { PickerField, type PickerBadgeItem } from "@/components/PickerField";
import { UserSelectModal } from "@/components/UserSelectModal";
import {
  createEvent,
  updateEvent,
  type EventActionOk,
  type EventActionResult,
  type EventResultField,
} from "@/lib/events/actions";
import type { EventClashCheckRequest } from "@/lib/events/clashActions";
import { EventClashCheck } from "./EventClashCheck";
import { subOneDay } from "@/lib/events/datetime";
import {
  buildOptimisticEvent,
  nextOptimisticOpId,
  optimisticUpsert,
  type OptimisticEventIdentity,
  type OptimisticUpsertOp,
} from "@/lib/events/optimistic";
import {
  categoryFromFlags,
  clampOutOfCamp,
  flagsFromCategory,
  LOCATION_CATEGORIES,
  LOCATION_CATEGORY_DESCRIPTIONS,
  LOCATION_CATEGORY_LABELS,
  normalizeAllowedLocations,
  type LocationCategory,
} from "@/lib/events/locationPolicy";
import { eventRefFromCalendarEvent } from "@/lib/events/targets";
import { buildEventTypePickerSections } from "@/lib/eventTypes/groups";
import {
  joinDateTimeParts,
  naiveDatePart,
  naiveTimePart,
  resolveTimeOption,
  TIME_OPTION_LABELS,
  type AmPm,
  type TimeOption,
} from "@/lib/events/timeOptions";
import { clampEventEnd, validateEventForm, type EventFormValues } from "@/lib/events/validate";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  formatEventTitle,
  type EventTitleInput,
  type EventTitlePerson,
} from "@/lib/settings/formatEventTitle";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { announce } from "@/lib/ui/announcer";
import { showValidationFailure } from "@/lib/ui/validationFeedback";
import {
  buildUserGroups,
  mergeInviteeSelection,
  selectionByGroup,
  splitInvitees,
} from "@/lib/users/userSelect";
import { formatDateTime, naiveToDate } from "./clientDateTime";

interface EventTypeOption {
  name: string;
  shortname: string | null;
  groupId: string | null;
  timeOptions: TimeOption[];
  allowedLocations: LocationCategory[];
  showRemarks: boolean;
  showInvitees: boolean;
  /** Whether the wizard shows the Location step for this type (off = skip). */
  showLocation: boolean;
  /** Admin-pinned event color, null = the deterministic default. */
  color: string | null;
}

interface InviteeUser {
  id: string;
  name: string;
  shortname: string | null;
  departmentName: string | null;
  departmentSort: number | null;
  displayName: string;
}

interface EventFormProps {
  event: CalendarEvent | null;
  /** When set (and `event` is null), the form opens in create mode but
      pre-fills all fields from this source event — the "duplicate" flow. */
  templateEvent?: CalendarEvent | null;
  defaultDate: string;
  eventTypes: EventTypeOption[];
  /** Event type groups in display order, for the grouped type picker. */
  eventTypeGroups: { id: string; name: string; sortOrder: number }[];
  /** Master template (Google) and per-view display template. */
  eventTitleTemplate: string;
  viewEventTitleTemplate?: string;
  viewLabel?: string;
  /** Session user id; stored as the event creator on create. */
  currentUser: string;
  /** Admin may create/edit events on behalf of any user (via the creator select). */
  isAdmin: boolean;
  inviteeDepartments: { id: string; name: string }[];
  inviteeUsers: InviteeUser[];
  onDone: () => void;
  /**
   * Optimistic mutation support. The grid behind the wizard shows the
   * submitted change immediately (see docs/optimistic-mutations.md); these
   * callbacks drive the overlay's apply/settle/rollback lifecycle.
   */
  onOptimistic: (op: OptimisticUpsertOp) => void;
  onOptimisticSettled: (opId: string, result: EventActionOk) => void;
  onOptimisticRollback: (opId: string) => void;
  /**
   * Home department of the acting user — the representative calendar a
   * brand-new optimistic event stands on until the server pins the real copy
   * (cosmetic only: the chip's rows come from its tagged people/departments).
   */
  optimisticHome: { id: string; name: string } | null;
}

interface EventFormState extends EventFormValues {
  invitees: string[];
}

const AMPM_OPTIONS = [
  { label: "AM", value: "AM" },
  { label: "PM", value: "PM" },
];

/** Wizard step ids for the staged event form. */
type StepId = "type" | "time" | "location" | "invitees" | "remarks" | "creator" | "review";

interface StepDef {
  id: StepId;
  /** Form fields that must validate cleanly before the step can be left. */
  fields: (keyof EventFormState)[];
}

/**
 * The full wizard walk: the location, remarks and invitees steps drop out per
 * the selected type's config. A type whose location step is hidden (admin-set
 * `show_location` off, only possible with a single allowed location) has no
 * Location step at all — every event saves in that sole category. An unlocked
 * exclusively in-camp type keeps the step but collapses the category selector
 * to a single, disabled option while still offering an optional specific
 * location. Types with remarks or invitees disabled have neither step. Admins
 * enter an optional "On behalf of" after Remarks (blank = themselves);
 * everyone ends on a read-only review of everything entered so far.
 */
function buildSteps(
  isAdmin: boolean,
  showLocationStep: boolean,
  showRemarksStep: boolean,
  showInviteesStep: boolean,
): StepDef[] {
  return [
    { id: "type", fields: [] },
    { id: "time", fields: ["start", "end", "startAmPm", "endAmPm"] },
    ...(showLocationStep ? [{ id: "location", fields: [] } satisfies StepDef] : []),
    ...(showInviteesStep ? [{ id: "invitees", fields: [] } satisfies StepDef] : []),
    ...(showRemarksStep ? [{ id: "remarks", fields: [] } satisfies StepDef] : []),
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

/**
 * Short display names for the step chip rail. They describe the *section*, not
 * a position — the walk's length shifts when the selected type hides its
 * remarks/invitees step, so numbered labels would renumber mid-flow.
 */
const STEP_LABELS: Record<StepId, string> = {
  type: "Type",
  time: "Time",
  location: "Location",
  invitees: "Attendees",
  remarks: "Remarks",
  creator: "Creator",
  review: "Review",
};

/**
 * The wizard's fixed body height. Steps scroll inside this box, so the modal
 * never resizes between them and the Back/Next/Submit bar stays put. It is
 * viewport-aware: capped by the modal's height budget (header + button bar +
 * breathing room) so the dialog always fits on short screens, and by 56dvh /
 * 540px so it never dominates a tall desktop viewport. 100dvh shrinks when the
 * on-screen keyboard opens, so the cap follows.
 */
const WIZARD_BODY_HEIGHT = "min(56dvh, 540px, calc(100dvh - 200px))";

/** Section label of the flat department list inside the invitee badge picker. */
const PICKER_DEPARTMENTS_SECTION = "Departments";

export function EventForm({
  event,
  templateEvent,
  defaultDate,
  eventTypes,
  eventTypeGroups,
  eventTitleTemplate,
  viewEventTitleTemplate,
  viewLabel,
  currentUser,
  isAdmin,
  inviteeDepartments,
  inviteeUsers,
  onDone,
  onOptimistic,
  onOptimisticSettled,
  onOptimisticRollback,
  optimisticHome,
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

  function buildInitialValues(): EventFormState {
    if (event) {
      const allDay = event.payload.allDay;
      const selectedType = eventTypes.find((type) => type.name === event.payload.eventType) ?? null;
      const allowed: TimeOption[] = selectedType ? selectedType.timeOptions : ["range"];
      const timeOption = resolveTimeOption(allowed, event.payload.timeOption);
      // A type whose location step is hidden pins its sole allowed category
      // and drops the specific location; otherwise clamp the stored flags
      // against the type's current allowed locations in case the matrix
      // tightened since last edited.
      const locationAllowed = selectedType ? normalizeAllowedLocations(selectedType.allowedLocations) : null;
      const hideLocation = selectedType?.showLocation === false;
      const clamped =
        hideLocation && locationAllowed && locationAllowed.length === 1
          ? { ...flagsFromCategory(locationAllowed[0]), location: "" }
          : clampOutOfCamp(
              selectedType ? selectedType.allowedLocations : undefined,
              event.payload.outOfCamp,
              event.payload.overseas,
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
        invitees:
          selectedType && selectedType.showInvitees === false
            ? []
            : [
                ...event.payload.inviteeDepartmentIds.map((id) => `dept:${id}`),
                ...event.payload.inviteeUserIds.map((id) => `user:${id}`),
              ],
        outOfCamp: clamped.outOfCamp,
        overseas: clamped.overseas,
        pinned: event.payload.pinned,
        location: clamped.location,
      };
    }
    // Duplicate: pre-fill from a source event but stay in create mode.
    if (templateEvent) {
      const src = templateEvent;
      const allDay = src.payload.allDay;
      const selectedType = eventTypes.find((t) => t.name === src.payload.eventType) ?? null;
      const allowed: TimeOption[] = selectedType ? selectedType.timeOptions : ["range"];
      const timeOption = resolveTimeOption(allowed, src.payload.timeOption);
      const locationAllowed = selectedType
        ? normalizeAllowedLocations(selectedType.allowedLocations)
        : null;
      const hideLocation = selectedType?.showLocation === false;
      const clamped =
        hideLocation && locationAllowed && locationAllowed.length === 1
          ? { ...flagsFromCategory(locationAllowed[0]), location: "" }
          : clampOutOfCamp(
              selectedType ? selectedType.allowedLocations : undefined,
              src.payload.outOfCamp,
              src.payload.overseas,
              src.payload.location,
            );
      return {
        title: src.payload.rawTitle ?? (src.title === "(no title)" ? "" : src.title),
        timeOption,
        startAmPm: src.payload.startAmPm ?? "AM",
        endAmPm: src.payload.endAmPm ?? "PM",
        start: src.start,
        end: allDay ? `${subOneDay(src.end.slice(0, 10))} 00:00:00` : src.end,
        eventType: src.payload.eventType ?? "",
        creatorId: src.payload.creatorId ?? "",
        inviteeUserIds: [],
        inviteeDepartments: [],
        invitees:
          selectedType && selectedType.showInvitees === false
            ? []
            : [
                ...src.payload.inviteeDepartmentIds.map((id) => `dept:${id}`),
                ...src.payload.inviteeUserIds.map((id) => `user:${id}`),
              ],
        outOfCamp: clamped.outOfCamp,
        overseas: clamped.overseas,
        pinned: src.payload.pinned,
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
      overseas: false,
      pinned: false,
      location: "",
    };
  }

  // Badge picker user sections (one per department, No department last), shared
  // by the invitees picker (which prepends a Departments section) and the admin
  // "On behalf of" creator picker (users only). Badges show the plain name —
  // the section header already carries the department — so the search haystack
  // only adds the shortname (section-label matching still finds whole
  // departments).
  const userPickerGroups = useMemo(
    () =>
      buildUserGroups(
        inviteeUsers.map((user) => ({
          id: user.id,
          label: user.name,
          department: user.departmentName,
          departmentSort: user.departmentSort,
          search: user.shortname || undefined,
        })),
      ),
    [inviteeUsers],
  );

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
      ...userPickerGroups,
    ],
    [inviteeDepartments, userPickerGroups],
  );

  // Seed the picker dialog draft from the current form value; re-derived every
  // render so the dialog always opens on the latest selection.
  const inviteePickerValues = useMemo(() => {
    const { userIds, departmentIds } = splitInvitees(form.values.invitees);
    return selectionByGroup(inviteePickerGroups, [...userIds, ...departmentIds]);
  }, [inviteePickerGroups, form.values.invitees]);

  // Commits the badge picker draft into the form. Previously selected ids
  // that no longer appear in the picker (e.g. now-inactive users) are kept
  // so editing can't silently drop them, and the locked creator is kept
  // first — see `mergeInviteeSelection` for the pure logic.
  function applyInviteePicker(values: Record<string, string[]>) {
    form.setFieldValue(
      "invitees",
      mergeInviteeSelection(
        inviteePickerGroups,
        form.values.invitees,
        values,
        form.values.creatorId || null,
        PICKER_DEPARTMENTS_SECTION,
      ),
    );
  }

  // Admin "On behalf of": the optional single-user creator picker (blank = the
  // acting admin). Seeded and committed exactly like the old dropdown — picking
  // a user also keeps the invitee chips in sync (the creator is always an
  // invitee); clearing removes the previous creator from them. `allowEmptyConfirm`
  // lets the dialog commit a cleared/"yourself" result in single mode.
  const creatorPickerValues = useMemo(
    () => selectionByGroup(userPickerGroups, form.values.creatorId ? [form.values.creatorId] : []),
    [userPickerGroups, form.values.creatorId],
  );

  function applyCreatorPicker(values: Record<string, string[]>) {
    const next = Object.values(values).flat()[0] ?? "";
    const previous = form.values.creatorId;
    const invitees = previous
      ? form.values.invitees.filter((entry) => entry !== `user:${previous}`)
      : [...form.values.invitees];
    form.setFieldValue("creatorId", next);
    form.setFieldValue("invitees", next ? [...new Set([...invitees, `user:${next}`])] : invitees);
  }

  const creatorOption = inviteeUsers.find((user) => user.id === form.values.creatorId) ?? null;
  const creatorSummaryItems: PickerBadgeItem[] = creatorOption
    ? [{ key: creatorOption.id, label: creatorOption.displayName, color: "brand" }]
    : [];

  const sortedEventTypes = useMemo(
    () => [...eventTypes].sort((a, b) => a.name.localeCompare(b.name)),
    [eventTypes],
  );

  // The type step's sections: one per group (in the admin's display order)
  // plus a trailing "Ungrouped" section; empty groups are skipped.
  const pickerSections = useMemo(
    () => buildEventTypePickerSections(eventTypes, eventTypeGroups),
    [eventTypes, eventTypeGroups],
  );

  const selectedType = sortedEventTypes.find((type) => type.name === form.values.eventType) ?? null;
  const allowedOptions: TimeOption[] = selectedType ? selectedType.timeOptions : ["range"];
  const effectiveTimeOption = resolveTimeOption(allowedOptions, form.values.timeOption);
  /**
   * The selected type's allowed location categories; untyped events are
   * unrestricted. Normalized defensively in case a stale prop row drifts.
   */
  const allowedLocations: LocationCategory[] = selectedType
    ? normalizeAllowedLocations(selectedType.allowedLocations)
    : [...LOCATION_CATEGORIES];
  /**
   * The Location step shows unless the type hides it: when `showLocation` is
   * off the step is skipped entirely (events save in the type's sole allowed
   * category with no specific location), while an in-camp-only type that still
   * shows it collapses the selector but keeps an optional specific place.
   */
  const showLocationStep = selectedType ? selectedType.showLocation !== false : true;
  /** Whether the wizard shows the Remarks step (per-type toggle). */
  const showRemarksStep = selectedType ? selectedType.showRemarks !== false : true;
  /** Whether the wizard shows the Invited Attendees step (per-type toggle). */
  const showInviteesStep = selectedType ? selectedType.showInvitees !== false : true;
  /**
   * The category a hidden-location type pins every event to (its sole allowed
   * category); null when the step is still shown or no type is selected.
   */
  const hiddenLocationCategory: LocationCategory | null =
    !showLocationStep && allowedLocations.length === 1 ? allowedLocations[0] : null;
  /**
   * The effective location flags + destination after the matrix is applied
   * (or the pinned category when the step is hidden — a hidden-location type
   * carries no specific location, so the string is dropped).
   */
  const effectiveOutOfCamp = hiddenLocationCategory
    ? { ...flagsFromCategory(hiddenLocationCategory), location: "" }
    : clampOutOfCamp(
        allowedLocations,
        form.values.outOfCamp,
        form.values.overseas,
        form.values.location,
      );
  /** The single category the effective flags resolve to (drives the selector). */
  const effectiveCategory: LocationCategory = categoryFromFlags(
    effectiveOutOfCamp.outOfCamp,
    effectiveOutOfCamp.overseas,
  );
  /** The location categories offered by the selector, in canonical order. */
  const allowedCategoryOptions = LOCATION_CATEGORIES.filter((category) =>
    allowedLocations.includes(category),
  );

  // Wizard state: a stepped walk through the form so the user only ever sees
  // one input group at a time. The step list depends on the role (admins get
  // the "On behalf of" step) and the selected type (location/remarks steps
  // drop out per its config). Rebuilt each render (a handful of tiny objects)
  // because its deps derive from reactive form values; the type is only ever
  // changed on step 1, so the step index stays valid when the list re-derives.
  const steps = buildSteps(isAdmin, showLocationStep, showRemarksStep, showInviteesStep);
  const [step, setStep] = useState(0);
  // Direction of the last step change ("forward"/"backward"), used to slide the
  // entering step in from the corresponding side (see `.wizard-step-enter` in
  // globals.css). Defaults forward so the initial step enters from the right.
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [inviteePickerOpen, setInviteePickerOpen] = useState(false);
  const [creatorPickerOpen, setCreatorPickerOpen] = useState(false);
  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;
  const stepPosition = `${step + 1} of ${steps.length}`;
  // The step body's scroll container. Steps swap in place inside a fixed-height
  // region (see `.c2-wizard-scroll`), so a step change must start scrolled to
  // the top even if the previous step had scrolled deep (a long type list, the
  // review step, ...).
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // On a step change: reset the body scroll and announce the arrival through
  // the shell's polite live region (the step indicator alone is not enough for
  // screen-reader users).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    announce(`Step ${stepPosition}: ${STEP_LABELS[currentStep.id]}`);
    // Intentional: only re-run when the visible step actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep.id]);

  function goBack() {
    setDirection("backward");
    setStep((index) => Math.max(index - 1, 0));
  }

  /**
   * Jump straight to any step (the bottom step strip / Stepper). Like the old
   * "Go to Summary" link, this never validates the steps in between — the
   * final submit still catches problems and returns the user to the owning
   * step. Tapping the step you are already on is a no-op.
   */
  function goToStep(index: number) {
    if (index === step) {
      return;
    }
    setDirection(index > step ? "forward" : "backward");
    setStep(index);
  }

  // Enter in a single-line input must never submit the form: the browser's
  // implicit submit (or the mobile keyboard's return key) would otherwise
  // commit the event mid-typing. Only the explicit Create/Save button
  // submits. Implicit submission only applies to single-line inputs and
  // selects, not textareas — so the Remarks Textarea keeps its natural
  // newline behavior. Component key handlers (e.g. the date/time pickers)
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
    setDirection("forward");
    setStep((index) => Math.min(index + 1, steps.length - 1));
  }

  // ---- date/time clamping helpers (end never before start) ----
  function applyClamped(patch: Partial<EventFormValues>) {
    const draft = { ...form.values, ...patch } as EventFormValues;
    const clamped = clampEventEnd(draft);
    // Apply the patch fields first, then any clamped end corrections.
    (
      Object.entries(patch) as [keyof EventFormValues, EventFormValues[keyof EventFormValues]][]
    ).forEach(([key, value]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.setFieldValue(key as string as any, value as any);
    });
    if (clamped.end !== draft.end) {
      form.setFieldValue("end", clamped.end);
    }
    if (clamped.endAmPm !== draft.endAmPm) {
      form.setFieldValue("endAmPm", clamped.endAmPm);
    }
  }

  function setStartField(nextStart: string) {
    applyClamped({ start: nextStart });
  }

  function setEndField(nextEnd: string) {
    // End edits clamp end to start (not start to end).
    const draft = { ...form.values, end: nextEnd } as EventFormValues;
    const clamped = clampEventEnd(draft);
    form.setFieldValue("end", clamped.end);
    if (clamped.endAmPm !== draft.endAmPm) {
      form.setFieldValue("endAmPm", clamped.endAmPm);
    }
  }

  function setStartAmPmField(next: AmPm) {
    applyClamped({ startAmPm: next });
  }

  function setEndAmPmField(next: AmPm) {
    const draft = { ...form.values, endAmPm: next } as EventFormValues;
    const clamped = clampEventEnd(draft);
    form.setFieldValue("endAmPm", clamped.endAmPm);
    if (clamped.end !== draft.end) {
      form.setFieldValue("end", clamped.end);
    }
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
    // Re-clamp after the option switch (e.g. range 09:00→10:00 collapsed to
    // full-day dates where start date might now be after end date).
    const next = clampEventEnd({
      ...form.values,
      timeOption: option,
      start:
        option !== "range" && form.values.start
          ? `${form.values.start.slice(0, 10)} 00:00:00`
          : form.values.start,
      end:
        option !== "range" && form.values.end
          ? `${form.values.end.slice(0, 10)} 00:00:00`
          : form.values.end,
      startAmPm: option === "half" ? form.values.startAmPm || "AM" : "",
      endAmPm: option === "half" ? form.values.endAmPm || "PM" : "",
    } as EventFormValues);
    if (next.end !== form.values.end) {
      // Defer to next tick so the intermediate setFieldValue above has flushed.
      // Directly setting here is safe because we compute from the pre-switch values.
      form.setFieldValue("end", next.end);
    }
    if (next.endAmPm !== form.values.endAmPm && option === "half") {
      form.setFieldValue("endAmPm", next.endAmPm);
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
    // Re-clamp the location category against the new type's allowed locations
    // (an in-camp-only type forces the flags off; the location is preserved).
    // A type whose location step is hidden pins its sole allowed category and
    // drops the specific location instead.
    const locationAllowed = type ? normalizeAllowedLocations(type.allowedLocations) : null;
    const hideLocation = type?.showLocation === false;
    const clamped =
      hideLocation && locationAllowed && locationAllowed.length === 1
        ? { ...flagsFromCategory(locationAllowed[0]), location: "" }
        : clampOutOfCamp(
            type ? type.allowedLocations : undefined,
            form.values.outOfCamp,
            form.values.overseas,
            form.values.location,
          );
    form.setFieldValue("outOfCamp", clamped.outOfCamp);
    form.setFieldValue("overseas", clamped.overseas);
    form.setFieldValue("location", clamped.location);
    // A type with remarks disabled carries no description.
    if (type && type.showRemarks === false) {
      form.setFieldValue("title", "");
    }
    // A type with invitees disabled carries no attendees beyond the creator.
    if (type && type.showInvitees === false) {
      form.setFieldValue("invitees", []);
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
  // The currently selected attendees, for the invitee step's summary badges
  // and the badge picker's draft seeding.
  const selectedInvitees = splitInvitees(form.values.invitees);
  // The invitee step's summary badges, in display order: users first (the
  // creator in brand, everyone else default) then tagged departments in accent.
  const inviteeSummaryItems: PickerBadgeItem[] = [
    ...selectedInvitees.userIds.flatMap((id) => {
      const person = peopleById[id];
      return person
        ? [
            {
              key: `user:${id}`,
              label: person.full,
              color: id === form.values.creatorId ? "brand" : undefined,
            },
          ]
        : [];
    }),
    ...selectedInvitees.departmentIds.flatMap((id) => {
      const name = departmentNames[id];
      return name ? [{ key: `dept:${id}`, label: name, color: "accent" }] : [];
    }),
  ];

  // "On behalf of" is optional: a blank select means the acting user, who is
  // always invited (mirroring the server's withSelfCreator normalization).
  // Preview and review derive their people from this effective list, so
  // {people} tokens match exactly what gets written. Types with invitees
  // disabled only ever carry the creator.
  const effectiveCreatorId = form.values.creatorId || currentUser;
  const effectiveInvitees = showInviteesStep
    ? [
        ...new Set([
          ...(effectiveCreatorId ? [`user:${effectiveCreatorId}`] : []),
          ...form.values.invitees,
        ]),
      ]
    : effectiveCreatorId
      ? [`user:${effectiveCreatorId}`]
      : [];

  // Live rendering of the exact title the server will write to Google, so the
  // user sees the final calendar summary (template tokens) before submitting.
  // Also show the per-view display title when it differs.
  const previewTitles = (() => {
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
      timeOption: effectiveTimeOption,
      startTime: naiveTimePart(form.values.start),
      endTime: naiveTimePart(form.values.end),
      startAmPm: effectiveTimeOption === "half" ? form.values.startAmPm || "AM" : "",
      endAmPm: effectiveTimeOption === "half" ? form.values.endAmPm || "PM" : "",
    };
    const render = (tpl: string) => {
      return formatEventTitle(input, tpl) || form.values.title.trim();
    };
    const master = render(eventTitleTemplate);
    const viewTpl = viewEventTitleTemplate ?? eventTitleTemplate;
    const view = viewTpl === eventTitleTemplate ? master : render(viewTpl);
    return { master, view, viewTpl, isSame: viewTpl === eventTitleTemplate };
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

  // The exact payload a submit sends to create/update — reused verbatim by the
  // review-step clash check so the advisory reasons about the saved event.
  function valuesToPayload(values: EventFormState): EventFormValues {
    const { invitees, ...rest } = values;
    const { userIds, departmentIds } = splitInvitees(invitees);
    return {
      ...rest,
      timeOption: effectiveTimeOption,
      startAmPm: effectiveTimeOption === "half" ? rest.startAmPm || "AM" : "",
      endAmPm: effectiveTimeOption === "half" ? rest.endAmPm || "PM" : "",
      inviteeUserIds: userIds,
      inviteeDepartments: departmentIds,
    };
  }

  // Read-only clash advisory on the review step: rebuilt (new object identity)
  // only when the candidate's effective window/people actually change, so the
  // check panel re-runs on those changes and stays idle otherwise. The review
  // step itself has no inputs, so in practice this runs once per arrival.
  const clashRequest = useMemo<EventClashCheckRequest | null>(() => {
    if (currentStep.id !== "review" || !form.values.start || !form.values.end) {
      return null;
    }
    return {
      values: valuesToPayload(form.values),
      ref: isEdit && event ? eventRefFromCalendarEvent(event) : null,
    };
    // form.values is the natural dependency; its reference only changes on an
    // actual field edit, which is exactly when the check must re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep.id, isEdit, event, effectiveTimeOption, form.values, isAdmin]);

  const onSubmit = form.onSubmit(
    async (values) => {
      // The submit button only renders on the last step; guard against
      // implicit form submission (e.g. Enter in a textbox) from earlier steps.
      if (!isLastStep) {
        return;
      }
      const payload = valuesToPayload(values);
      const optimisticId = nextOptimisticOpId();
      // The stand-in chip mirrors the edit's real copy identity (so the old
      // grid entry is replaced in place) or, on create, carries a client
      // placeholder group id on the acting user's home department.
      const identity: OptimisticEventIdentity =
        isEdit && event
          ? {
              calendarId: event.payload.calendarId,
              calendarName: event.payload.calendarName,
              googleEventId: event.payload.googleEventId,
              eventId: event.payload.eventId,
            }
          : {
              calendarId: optimisticHome?.id ?? "",
              calendarName: optimisticHome?.name ?? "",
              googleEventId: "",
              eventId: optimisticId,
            };
      const optimisticEvent = buildOptimisticEvent({
        identity,
        values: payload,
        actingUserId: currentUser,
        // The grid renders this view's display template; previewTitles.view is
        // that exact string, so the stand-in matches the authoritative chip.
        title: previewTitles.view,
        eventTypeColor: selectedType?.color ?? null,
      });
      onOptimistic(optimisticUpsert(optimisticId, optimisticEvent));

      const result: EventActionResult = isEdit
        ? await updateEvent(eventRefFromCalendarEvent(event), payload)
        : await createEvent(payload);

      if (result.ok) {
        notifications.show({
          color: "green",
          message: isEdit ? "Event updated" : "Event created",
        });
        // Pin the stand-in to the server's group/copy ids, then let the
        // authoritative refresh swap it out (see DashboardView).
        onOptimisticSettled(optimisticId, result);
        onDone();
        return;
      }

      // The action rejected (field or server error) — drop the stand-in so the
      // grid shows the pre-submit state while the form surfaces the error.
      onOptimisticRollback(optimisticId);

      if (result.field) {
        const failedField = result.field;
        form.setFieldError(failedField, result.error);
        // Land the user on the step that owns the failing field.
        const target = steps.findIndex((s) => s.id === STEP_BY_FIELD[failedField]);
        if (target >= 0) {
          setDirection(target > step ? "forward" : "backward");
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
    // Start & End stores date and time in one naive string per side, so the
    // validator error lands on the widget at fault: a missing date under the
    // date input, a missing time or an out-of-order end under the time input.
    const dateError = (field: "start" | "end") =>
      form.values[field] ? undefined : form.errors[field];
    const timeError = (field: "start" | "end") =>
      form.values[field] ? form.errors[field] : undefined;
    // End must never be before start — clamp on every edit and also hint
    // via minDate so the picker greys out earlier dates.
    const endMinDate = form.values.start
      ? naiveToDate(`${form.values.start.slice(0, 10)} 00:00:00`)
      : null;
    const startField =
      option === "range" ? (
        <Stack gap="xs">
          <DatePickerInput
            label="Start date"
            value={naiveDatePart(form.values.start) || null}
            onChange={(value) =>
              setStartField(joinDateTimeParts(value ?? "", naiveTimePart(form.values.start)))
            }
            error={dateError("start")}
            popoverProps={{ trapFocus: false }}
          />
          <TimePicker
            label="Start time"
            value={naiveTimePart(form.values.start)}
            onChange={(time) =>
              setStartField(joinDateTimeParts(naiveDatePart(form.values.start), time))
            }
            withDropdown
            minutesStep={15}
            error={timeError("start")}
            popoverProps={{ trapFocus: false }}
          />
        </Stack>
      ) : (
        <>
          <DatePickerInput
            label="Start date"
            value={naiveToDate(form.values.start)}
            onChange={(value) => setStartField(value ? `${value} 00:00:00` : "")}
            error={form.errors.start}
          />
          {showAmPm && (
            <Stack gap={4}>
              <SegmentedControl
                aria-label="Start AM or PM"
                data={AMPM_OPTIONS}
                value={form.values.startAmPm || undefined}
                onChange={(value) => setStartAmPmField(value as AmPm)}
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
        <Stack gap="xs">
          <DatePickerInput
            label="End date"
            value={naiveDatePart(form.values.end) || null}
            onChange={(value) =>
              setEndField(joinDateTimeParts(value ?? "", naiveTimePart(form.values.end)))
            }
            error={dateError("end")}
            minDate={endMinDate ?? undefined}
            popoverProps={{ trapFocus: false }}
          />
          <TimePicker
            label="End time"
            value={naiveTimePart(form.values.end)}
            onChange={(time) =>
              setEndField(joinDateTimeParts(naiveDatePart(form.values.end), time))
            }
            withDropdown
            minutesStep={15}
            error={timeError("end")}
            popoverProps={{ trapFocus: false }}
          />
        </Stack>
      ) : (
        <>
          <DatePickerInput
            label="End date"
            value={naiveToDate(form.values.end)}
            onChange={(value) => setEndField(value ? `${value} 00:00:00` : "")}
            error={form.errors.end}
            minDate={endMinDate ?? undefined}
          />
          {showAmPm && (
            <Stack gap={4}>
              <SegmentedControl
                aria-label="End AM or PM"
                data={AMPM_OPTIONS}
                value={form.values.endAmPm || undefined}
                onChange={(value) => setEndAmPmField(value as AmPm)}
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
    <form
      onSubmit={onSubmit}
      onKeyDown={handleFormKeyDown}
      className="c2-event-wizard"
      style={{ height: WIZARD_BODY_HEIGHT }}
    >
      <div
        tabIndex={-1}
        data-autofocus
        aria-hidden="true"
        style={{ position: "fixed", top: 0, left: 0, opacity: 0, pointerEvents: "none" }}
      />
      {/* Step content. Fixed-height + internal scroll (see `.c2-wizard-scroll`):
          the modal no longer resizes between steps, so the footer below never
          moves. */}
      <div ref={scrollRef} className="c2-wizard-scroll">
        {currentStep.id === "type" && (
          <div
            key={currentStep.id}
            className="wizard-step-enter"
            style={{ "--slide-dir": direction === "forward" ? 1 : -1 } as React.CSSProperties}
          >
            <Stack gap="xs">
              {sortedEventTypes.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No event types
                </Text>
              ) : (
                <Stack gap="sm">
                  {pickerSections.map((section) => (
                    <Box key={section.ungrouped ? "ungrouped" : section.name}>
                      <Text size="xs" fw={600} c="dimmed" mb={4}>
                        {section.name}
                      </Text>
                      <Group gap={6} wrap="wrap">
                        {section.types.map((type) => {
                          const selected = type.name === form.values.eventType;
                          return (
                            <Badge
                              key={type.name}
                              variant={selected ? "filled" : "light"}
                              size="lg"
                              style={{
                                height: "calc(var(--badge-height-lg) * 1.5)",
                                cursor: "pointer",
                              }}
                              onClick={() => handleEventTypeChange(selected ? null : type.name)}
                            >
                              {type.name}
                            </Badge>
                          );
                        })}
                      </Group>
                    </Box>
                  ))}
                </Stack>
              )}
              {form.errors.eventType && (
                <Text size="xs" c="red">
                  {form.errors.eventType}
                </Text>
              )}
            </Stack>
          </div>
        )}

        {currentStep.id === "time" &&
          (showTabs ? (
            <div
              key={currentStep.id}
              className="wizard-step-enter"
              style={{ "--slide-dir": direction === "forward" ? 1 : -1 } as React.CSSProperties}
            >
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
            </div>
          ) : (
            <div
              key={currentStep.id}
              className="wizard-step-enter"
              style={{ "--slide-dir": direction === "forward" ? 1 : -1 } as React.CSSProperties}
            >
              {timeFields(effectiveTimeOption)}
            </div>
          ))}

        {currentStep.id === "location" && (
          <div
            key={currentStep.id}
            className="wizard-step-enter"
            style={{ "--slide-dir": direction === "forward" ? 1 : -1 } as React.CSSProperties}
          >
            <Stack>
              <Text fw={500} size="sm">
                Location
              </Text>
              <SegmentedControl
                aria-label="Location"
                fullWidth
                data={allowedCategoryOptions.map((category) => ({
                  value: category,
                  label: LOCATION_CATEGORY_LABELS[category],
                }))}
                value={effectiveCategory}
                disabled={allowedCategoryOptions.length === 1}
                onChange={(value) => {
                  const flags = flagsFromCategory(value as LocationCategory);
                  form.setFieldValue("outOfCamp", flags.outOfCamp);
                  form.setFieldValue("overseas", flags.overseas);
                }}
              />
              <TextInput
                label={effectiveCategory === "overseas" ? "Overseas location" : "Location"}
                placeholder={
                  effectiveCategory === "overseas"
                    ? "Where the event takes place overseas"
                    : "Where the event takes place"
                }
                {...form.getInputProps("location")}
              />
              <Text size="xs" c="dimmed">
                {LOCATION_CATEGORY_DESCRIPTIONS[effectiveCategory]}
              </Text>
            </Stack>
          </div>
        )}

        {currentStep.id === "invitees" && (
          <div
            key={currentStep.id}
            className="wizard-step-enter"
            style={{ "--slide-dir": direction === "forward" ? 1 : -1 } as React.CSSProperties}
          >
            <Stack gap="sm">
              {inviteePickerGroups.length > 0 ? (
                <PickerField
                  label="Invited Attendees"
                  description="A copy of the event is created in each tagged person's department and in each tagged department"
                  items={inviteeSummaryItems}
                  onOpen={() => setInviteePickerOpen(true)}
                />
              ) : (
                <Text size="sm" c="dimmed">
                  No active users or departments to tag yet.
                </Text>
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
              <Switch
                label="Pin this event"
                description="Shows this event in the Pinned Events panel on every page"
                {...form.getInputProps("pinned", { type: "checkbox" })}
              />
            </Stack>
          </div>
        )}

        {currentStep.id === "remarks" && (
          <div
            key={currentStep.id}
            className="wizard-step-enter"
            style={{ "--slide-dir": direction === "forward" ? 1 : -1 } as React.CSSProperties}
          >
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
          </div>
        )}

        {/* Admins only, after Remarks: who this event is recorded as created
            or edited by. Optional — leaving it blank means the event belongs
            to the acting admin. Picking a user keeps the invitee chips in sync
            (the creator is always an invitee, mirroring the server's
            withSelfCreator normalization); the review step below reflects the
            effective owner. */}
        {currentStep.id === "creator" && (
          <div
            key={currentStep.id}
            className="wizard-step-enter"
            style={{ "--slide-dir": direction === "forward" ? 1 : -1 } as React.CSSProperties}
          >
            <Stack gap="sm">
              <PickerField
                label="On behalf of"
                description="Optional — leave empty to create or edit this event as yourself"
                items={creatorSummaryItems}
                empty={
                  <Text size="xs" c="dimmed">
                    Yourself
                  </Text>
                }
                onOpen={() => setCreatorPickerOpen(true)}
              />
              {form.errors.creatorId && (
                <Text size="xs" c="red">
                  {form.errors.creatorId}
                </Text>
              )}
              {creatorPickerOpen && (
                <UserSelectModal
                  opened
                  onClose={() => setCreatorPickerOpen(false)}
                  title="On behalf of"
                  confirmLabel="Select"
                  groups={userPickerGroups}
                  values={creatorPickerValues}
                  onConfirm={applyCreatorPicker}
                  single
                  allowEmptyConfirm
                  zIndex={300}
                />
              )}
            </Stack>
          </div>
        )}

        {/* Last step: a read-only review of everything entered. The calendar
            preview lives here — it renders the exact title the server will
            write to Google. Submitting commits the event. */}
        {currentStep.id === "review" && (
          <div
            key={currentStep.id}
            className="wizard-step-enter"
            style={{ "--slide-dir": direction === "forward" ? 1 : -1 } as React.CSSProperties}
          >
            <Stack gap="sm">
              <Paper withBorder p="sm">
                <Stack gap={4}>
                  <Text size="sm" fw={500} c="accent.6" tt="uppercase">
                    Calendar preview
                  </Text>
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">
                      Google will store as:
                    </Text>
                    <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
                      {previewTitles.master || "—"}
                    </Text>
                  </Stack>
                  {!previewTitles.isSame && (
                    <Stack gap={2}>
                      <Text size="xs" c="dimmed">
                        {viewLabel
                          ? `${viewLabel} view will display as:`
                          : "This view will display as:"}
                      </Text>
                      <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
                        {previewTitles.view || "—"}
                      </Text>
                    </Stack>
                  )}
                </Stack>
              </Paper>

              <EventClashCheck request={clashRequest} />

              <Stack gap={4}>
                <Text size="xs" c="dimmed" fw={600}>
                  When
                </Text>
                <Text size="sm">{whenText || "—"}</Text>
              </Stack>

              <Stack gap={4}>
                <Text size="xs" c="dimmed" fw={600}>
                  Pinned
                </Text>
                {form.values.pinned ? (
                  <Badge variant="light" color="accent">
                    Pinned to the Pinned Events panel
                  </Badge>
                ) : (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                )}
              </Stack>

              {showLocationStep && (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed" fw={600}>
                    Location
                  </Text>
                  <Group gap={6} wrap="wrap">
                    <Badge
                      variant="light"
                      color={effectiveOutOfCamp.outOfCamp ? "yellow" : "green"}
                    >
                      {effectiveOutOfCamp.outOfCamp ? "Out of Camp" : "In Camp"}
                    </Badge>
                    {effectiveOutOfCamp.overseas && (
                      <Badge variant="light" color="blue">
                        Overseas
                      </Badge>
                    )}
                    {effectiveOutOfCamp.location && (
                      <Text size="sm" c="dimmed">
                        {effectiveOutOfCamp.location}
                      </Text>
                    )}
                  </Group>
                </Stack>
              )}

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

              {showRemarksStep && (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed" fw={600}>
                    Remarks
                  </Text>
                  <Text size="sm" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                    {form.values.title.trim() || "—"}
                  </Text>
                </Stack>
              )}
            </Stack>
          </div>
        )}
      </div>

      {/* Bottom step strip: a caption naming the current section plus a compact
          Stepper, both anchored above the action bar so they live in the thumb
          zone next to Back/Next. The circles are joined by connector lines so
          the row reads unambiguously as a left→right step path; passed steps
          show a check, the current circle is filled, future ones are outlined.
          Tapping any circle is a free jump (see `goToStep`). Inline per-step
          labels are omitted — the modal is too narrow for them — so the
          current step's real name always shows in the caption instead. */}
      <Stack gap={4} className="c2-wizard-steps">
        <Group justify="space-between">
          <Text size="sm" fw={600} style={{ lineHeight: 1.4 }}>
            {STEP_LABELS[currentStep.id]}
          </Text>
          <Text size="xs" c="dimmed">
            Step {step + 1} of {steps.length}
          </Text>
        </Group>
        <Stepper
          active={step}
          onStepClick={goToStep}
          allowNextStepsSelect
          wrap={false}
          size="sm"
          iconSize={24}
          styles={{ separator: { marginInline: 6 } }}
        >
          {steps.map((s) => (
            <Stepper.Step key={s.id} aria-label={STEP_LABELS[s.id]} />
          ))}
        </Stepper>
      </Stack>

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
    </form>
  );
}
