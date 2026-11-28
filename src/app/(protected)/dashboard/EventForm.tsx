"use client";

import "@mantine/dates/styles.css";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Badge,
  Button,
  Collapse,
  Grid,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconCloudOff,
  IconUserMinus,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { PickerBadges, PickerField, type PickerBadgeItem } from "@/components/PickerField";
import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";
import { EventTypeGroupGrid } from "@/components/EventTypeGroupGrid";
import { useActionPill } from "@/components/ActionPill";
import { useMotion } from "@/components/MotionProvider";
import { TimeSelectField } from "@/components/TimeSelectField";
import { UserSelectModal } from "@/components/UserSelectModal";
import {
  createEvent,
  updateEvent,
  type EventActionOk,
  type EventActionResult,
  type EventMutationScope,
  type EventResultField,
} from "@/lib/events/actions";
import type { EventClashCheckRequest } from "@/lib/events/clashActions";
import { fetchRecentLocations } from "@/lib/events/recentLocations";
import { EventClashCheck } from "./EventClashCheck";
import { EventFormSteps } from "./EventFormSteps";
import { WIZARD_BODY_HEIGHT_DESKTOP, WIZARD_BODY_HEIGHT_MOBILE } from "./eventFormLayout";
import { STEP_LABELS, buildSteps, type StepId } from "./eventFormStepLogic";
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
import {
  MAX_RECURRENCE_COUNT,
  MAX_RECURRENCE_INTERVAL,
  recurrenceSummary,
  WEEKDAY_LABELS,
  WEEKDAY_PICKER_ORDER,
  weekdayOf,
  type RecurrenceFrequency,
  type RecurrenceRule,
} from "@/lib/events/recurrence";
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
import {
  clampEventEnd,
  clampEventStart,
  END_ORDER_ERROR,
  needsClamp,
  stepRegistrationCap,
  validateEventForm,
  type EventFormValues,
} from "@/lib/events/validate";
import { effectiveFreeText, effectiveInviteeTags } from "@/lib/events/effectiveFields";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  renderTitleRecipe,
  type EventTitlePerson,
  type EventTitleRecipeInput,
  type TitleRecipe,
} from "@/lib/settings/titleRecipe";
import { BUTTON_LOADER_PROPS, DESKTOP_WIDE_MEDIA_QUERY } from "@/lib/theme";
import type { SavedEventToastVariant, WizardStepIndicator } from "@/lib/settings/featureFlags";
import { announce } from "@/lib/ui/announcer";
import { useIsOffline } from "@/lib/ui/onlineStatus";
import { firstErrorField, showValidationFailure } from "@/lib/ui/validationFeedback";
import {
  buildUserGroups,
  departmentPickerOptions,
  mergeInviteeSelection,
  removeInvitee,
  selectionByGroup,
  splitInvitees,
  toggleInviteeUser,
} from "@/lib/users/userSelect";
import { departmentTreeRows } from "@/lib/roster/hierarchy";
import type { EventTypeOption } from "@/lib/dashboard/types";
import { formatDateTime, naiveToDate } from "./clientDateTime";

interface InviteeUser {
  id: string;
  name: string;
  shortname: string | null;
  departmentName: string | null;
  departmentSort: number | null;
  departmentId: string | null;
  departmentParentId: string | null;
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
  eventTypeGroups: { id: string; name: string; sortOrder: number; collapsible: boolean }[];
  /** Master recipe (Google) and per-view display recipe. */
  eventTitleRecipe: TitleRecipe;
  viewEventTitleRecipe?: TitleRecipe;
  viewLabel?: string;
  /**
   * Post-save event confirmation style (Settings → Feature Flags): `pill`
   * (classic) | `pillRestyle` | `toastAction` | `toastPlain`. Picked by the
   * submit handler's success branch.
   */
  savedEventToastVariant?: SavedEventToastVariant;
  /** How the wizard names its steps (Settings → Feature Flags). */
  wizardStepIndicator: WizardStepIndicator;
  /** Session user id; stored as the event organizer on create. */
  currentUser: string;
  /**
   * Admins may edit any event and may toggle the organizer-only lock — they
   * never create events "on behalf of" another user (the organizer is always
   * the acting user).
   */
  isAdmin: boolean;
  inviteeDepartments: { id: string; name: string; sortOrder: number; parentId: string | null }[];
  inviteeUsers: InviteeUser[];
  onDone: () => void;
  /** Open the just-saved event's details modal (the toast "View event" action). */
  onViewSaved?: (eventId: string | null) => void;
  /**
   * Leave the wizard and open a conflicting event on the calendar (the
   * review-step advisory's "Open in calendar"). Discards the draft, so the
   * advisory confirms before calling it.
   */
  onOpenInCalendar?: (event: CalendarEvent) => void;
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
  /**
   * Which slice of a repeating series this edit applies to. Null/undefined for
   * a create or a one-off edit; "single" hides the Repeat step and locks the
   * series-level controls.
   */
  scope?: EventMutationScope | null;
  /** Reports the form's submit-in-flight state to the host's discard guards. */
  onSubmittingChange?: (submitting: boolean) => void;
  /**
   * The hosting modal is hidden (minimized to the draft bar). Nested dialogs
   * (the review step's read-only clash detail) portal out of the keepMounted
   * wizard, so they must close rather than stay painted over the calendar —
   * see docs/event-lifecycle.md §1.4.4.
   */
  hidden?: boolean;
}

interface EventFormState extends EventFormValues {
  /** Always resolved in the form; the server field stays optional for legacy payloads. */
  registrationEnabled: boolean;
  invitees: string[];
}

const AMPM_OPTIONS = [
  { label: "AM", value: "AM" },
  { label: "PM", value: "PM" },
];

/** Maps a server-reported error field to the wizard step that owns it. */
const STEP_BY_FIELD: Partial<Record<EventResultField | "registrationCap" | "recurrence", StepId>> =
  {
    title: "remarks",
    start: "time",
    end: "time",
    startAmPm: "time",
    endAmPm: "time",
    registrationCap: "settings",
    recurrence: "settings",
  };

/** Section label of the flat department list inside the invitee badge picker. */
const PICKER_DEPARTMENTS_SECTION = "Departments";

/**
 * The wizard's one hard people rule: every saved event must occupy someone.
 * Surfaced when the user leaves the Participants step (and, as the strip-jump
 * safety net, at submit) — never only at submit.
 */
const INVITEES_REQUIRED_ERROR = "Add at least one participant or department";

/**
 * Bordered section card used by the Other settings and Review steps — the same
 * recipe as the review step's Calendar preview card (border + uppercase accent
 * caption), so every grouped block in the wizard reads as one family.
 */
function WizardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper withBorder p="sm">
      <Text size="sm" fw={500} c="accent.6" tt="uppercase" mb={6}>
        {title}
      </Text>
      <Stack gap="sm">{children}</Stack>
    </Paper>
  );
}

export function EventForm({
  event,
  templateEvent,
  defaultDate,
  eventTypes,
  eventTypeGroups,
  eventTitleRecipe,
  viewEventTitleRecipe,
  viewLabel,
  savedEventToastVariant,
  wizardStepIndicator,
  currentUser,
  isAdmin,
  inviteeDepartments,
  inviteeUsers,
  onDone,
  onViewSaved,
  onOpenInCalendar,
  onOptimistic,
  onOptimisticSettled,
  onOptimisticRollback,
  optimisticHome,
  scope = null,
  onSubmittingChange,
  hidden = false,
}: EventFormProps) {
  const isEdit = event !== null;
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  // The modal's wide-desktop tier (>= 800px, where the host widens the dialog
  // to 720px, the review step reflows into two columns, and the step strip
  // turns into the vertical rail below). Layout gating must match DashboardView's
  // form modal sizing exactly — this is that same query.
  const isDesktopWide = useMediaQuery(DESKTOP_WIDE_MEDIA_QUERY);
  // The body height follows the screen size: phones fill the centered
  // modal's box entirely (`WIZARD_BODY_HEIGHT_MOBILE`), the desktop shell
  // uses the taller capped center (`WIZARD_BODY_HEIGHT_DESKTOP`). Either way
  // it stays constant for the whole walk, so the step strip and
  // Back/Next/Submit bar never move.
  const bodyHeight = isDesktop ? WIZARD_BODY_HEIGHT_DESKTOP : WIZARD_BODY_HEIGHT_MOBILE;
  // At the wide tier the taller body makes a horizontal step strip a waste of
  // the width it sits in: the guided strip instead becomes a left rail beside
  // the scroll area (`.c2-event-wizard--split` in globals.css). The strip is
  // locked to `guided`, so the flag is really just the width query — kept
  // explicit so the rail can never appear on the `rail`/`classic` variants.
  const verticalSteps = wizardStepIndicator === "guided" && isDesktopWide;
  const { show: showActionPill } = useActionPill();
  // Offline (docs/ui-ux-improvements.md D7): the submit button goes
  // unavailable with a one-line reason next to it — minimizing keeps the
  // draft alive (a full reload still starts fresh; persisting the draft is
  // backlog D21), so the work is not lost on the path the copy promises, and
  // only the write waits for the connection. Enhancement only:
  // `navigator.onLine === false` is the conservative report, and the server
  // stays the authority.
  const offline = useIsOffline();
  // Motion cadence for the inline time-snap hint (docs/motion.md: no component
  // hardcodes a duration).
  const motion = useMotion();
  // One quiet line under the time controls explaining the automatic move when
  // editing one side snapped the other; null hides it. The screen-reader copy
  // goes through `announce()` instead (one polite live region app-wide).
  const [timeSnapHint, setTimeSnapHint] = useState<string | null>(null);
  // Send the participant Web Push batch with this save? Per-save on purpose —
  // it is about this save, not a preference, so it is never stored or sent with
  // the event (docs/event-notifications.md §1.1).
  const [notifyParticipants, setNotifyParticipants] = useState(true);

  const form = useForm<EventFormState>({
    initialValues: buildInitialValues(),
    validate: (values) => validateEventForm(values),
    // Blur-validation only covers the getInputProps-bound fields (title,
    // location); the wizard's goNext already gates every other step.
    validateInputOnBlur: true,
  });

  useEffect(() => {
    onSubmittingChange?.(form.submitting);
  }, [form.submitting, onSubmittingChange]);

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
      const locationAllowed = selectedType
        ? normalizeAllowedLocations(selectedType.allowedLocations)
        : null;
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
        // The organizer's note round-trips through the notes block, so editing
        // prefills it instead of scraping the calendar's plain-text notes.
        remarks: event.payload.remarks ?? "",
        timeOption,
        // Prefill any half-day markers stored in the notes (legacy full-day
        // events may carry them); AM→PM keeps plain spans marker-free.
        startAmPm: event.payload.startAmPm ?? "AM",
        endAmPm: event.payload.endAmPm ?? "PM",
        start: event.start,
        end: allDay ? `${subOneDay(event.end.slice(0, 10))} 00:00:00` : event.end,
        eventType: event.payload.eventType ?? "",
        // The stored organizer is fixed (server-side authoritative); a
        // creator-less legacy event shows the acting user (any allowed editor
        // is adopted as the organizer on that first edit), whom the server
        // records.
        creatorId: event.payload.creatorId ?? currentUser,
        inviteeUserIds: [],
        inviteeDepartments: [],
        registrationEnabled: event.payload.registrationEnabled,
        registrationCap: event.payload.registrationEnabled
          ? (event.payload.registrationCap ?? null)
          : null,
        invitees:
          selectedType && selectedType.showInvitees === false && !event.payload.registrationEnabled
            ? []
            : event.payload.registrationEnabled
              ? // Registration events never carry department tags.
                event.payload.inviteeUserIds.map((id) => `user:${id}`)
              : [
                  ...event.payload.inviteeDepartmentIds.map((id) => `dept:${id}`),
                  // Attendees are pre-seeded as stored (a legacy event that
                  // auto-invited the organizer keeps them here, deselectable).
                  ...event.payload.inviteeUserIds.map((id) => `user:${id}`),
                ],
        outOfCamp: clamped.outOfCamp,
        overseas: clamped.overseas,
        pinned: event.payload.pinned,
        pinnedDepartments: event.payload.pinnedDepartments ?? [],
        ownerOnlyEdits: event.payload.registrationEnabled ? true : event.payload.ownerOnlyEdits,
        location: clamped.location,
        recurrence: event.payload.recurrence ?? null,
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
        remarks: src.payload.remarks ?? "",
        timeOption,
        startAmPm: src.payload.startAmPm ?? "AM",
        endAmPm: src.payload.endAmPm ?? "PM",
        start: src.start,
        end: allDay ? `${subOneDay(src.end.slice(0, 10))} 00:00:00` : src.end,
        eventType: src.payload.eventType ?? "",
        // A duplicate is a brand-new event owned by the acting user — the
        // source organizer never carries over. Registrations are per-event, so
        // a duplicated registration event starts with an empty roster.
        creatorId: currentUser,
        inviteeUserIds: [],
        inviteeDepartments: [],
        // A duplicate keeps the source event's registration choice and cap
        // (both are event parameters), but its roster starts empty. Registration
        // always carries the organizer-only lock.
        registrationEnabled: src.payload.registrationEnabled,
        registrationCap: src.payload.registrationEnabled
          ? (src.payload.registrationCap ?? null)
          : null,
        invitees:
          selectedType && selectedType.showInvitees === false
            ? []
            : src.payload.registrationEnabled
              ? []
              : [
                  ...src.payload.inviteeDepartmentIds.map((id) => `dept:${id}`),
                  ...src.payload.inviteeUserIds.map((id) => `user:${id}`),
                ],
        outOfCamp: clamped.outOfCamp,
        overseas: clamped.overseas,
        pinned: src.payload.pinned,
        pinnedDepartments: src.payload.pinnedDepartments ?? [],
        ownerOnlyEdits: src.payload.registrationEnabled ? true : false,
        location: clamped.location,
        recurrence: src.payload.recurrence ?? null,
      };
    }
    return {
      title: "",
      remarks: "",
      timeOption: "range",
      startAmPm: "AM",
      endAmPm: "PM",
      start: `${defaultDate} 09:00:00`,
      end: `${defaultDate} 10:00:00`,
      eventType: "",
      // Every event is created by the acting user — admins no longer create
      // "on behalf of" anyone. The acting user is PRE-tagged as a participant
      // by default (deselectable in the Participants step) so a newly created
      // event occupies at least its organizer; deselecting everyone is
      // rejected at submit.
      creatorId: currentUser,
      inviteeUserIds: [],
      inviteeDepartments: [],
      registrationEnabled: false,
      registrationCap: null,
      invitees: [`user:${currentUser}`],
      outOfCamp: false,
      overseas: false,
      pinned: false,
      pinnedDepartments: [],
      ownerOnlyEdits: false,
      location: "",
      recurrence: null,
    };
  }

  const sortedEventTypes = useMemo(
    () => [...eventTypes].sort((a, b) => a.name.localeCompare(b.name)),
    [eventTypes],
  );

  const selectedType = sortedEventTypes.find((type) => type.name === form.values.eventType) ?? null;
  /** Whether this event is open for self-registration (per-event, wizard choice). */
  const registrationType = form.values.registrationEnabled === true;

  /** The current repeat rule (null = one-off). */
  const recurrence = form.values.recurrence ?? null;
  const recurrenceDuration: "forever" | "count" | "until" = recurrence?.until
    ? "until"
    : recurrence?.count
      ? "count"
      : "forever";
  const setRecurrence = (next: RecurrenceRule | null) => {
    form.setFieldValue("recurrence", next);
  };
  const updateRecurrence = (patch: Partial<RecurrenceRule>) => {
    if (!recurrence) {
      return;
    }
    setRecurrence({ ...recurrence, ...patch });
  };
  const changeFrequency = (value: string) => {
    if (value === "none") {
      form.clearFieldError("recurrence");
      setRecurrence(null);
      return;
    }
    const freq = value as RecurrenceFrequency;
    const startDate = form.values.start.slice(0, 10);
    const weekday = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? weekdayOf(startDate) : 1;
    const base = recurrence ?? { freq, interval: 1 };
    const next: RecurrenceRule = {
      ...base,
      freq,
      byWeekday:
        freq === "weekly" ? (base.byWeekday?.length ? base.byWeekday : [weekday]) : undefined,
    };
    setRecurrence(next);
    announce(`Repeats ${recurrenceSummary(next, form.values.start)}`);
  };
  const toggleRepeats = (checked: boolean) => {
    if (checked) {
      changeFrequency("weekly");
    } else {
      form.clearFieldError("recurrence");
      setRecurrence(null);
    }
  };
  const toggleWeekday = (day: number) => {
    if (!recurrence) {
      return;
    }
    const selected = new Set(recurrence.byWeekday ?? []);
    if (selected.has(day)) {
      selected.delete(day);
    } else {
      selected.add(day);
    }
    updateRecurrence({ byWeekday: [...selected].sort((a, b) => a - b) });
  };
  const changeDuration = (value: string) => {
    if (!recurrence) {
      return;
    }
    if (value === "forever") {
      updateRecurrence({ count: null, until: null });
    } else if (value === "count") {
      updateRecurrence({ until: null, count: recurrence.count ?? 10 });
    } else {
      updateRecurrence({
        count: null,
        until:
          recurrence.until ??
          (/^\d{4}-\d{2}-\d{2}$/.test(form.values.start.slice(0, 10))
            ? form.values.start.slice(0, 10)
            : null),
      });
    }
  };
  const recurrenceText = recurrence
    ? recurrenceSummary(recurrence, form.values.start)
    : "Does not repeat";

  /** Apply a −10/−1/+1/+10 step to the registration cap (never below 1). */
  const bumpRegistrationCap = (delta: number) => {
    const next = stepRegistrationCap(form.values.registrationCap, delta);
    form.setFieldValue("registrationCap", next);
    announce(`Maximum registrations: ${next}`);
  };

  // Badge picker user sections (one per department, No department last) for
  // the invitees picker (which prepends a Departments section). Badges show
  // the plain name — the section header already carries the department — so
  // the search haystack only adds the shortname (section-label matching still
  // finds whole departments). The department id + parent id let the sections
  // nest under their parent departments (indented, mirroring the tree).
  const userPickerGroups = useMemo(
    () =>
      buildUserGroups(
        inviteeUsers.map((user) => ({
          id: user.id,
          label: user.name,
          department: user.departmentName,
          departmentSort: user.departmentSort,
          departmentId: user.departmentId,
          departmentParentId: user.departmentParentId,
          search: user.shortname || undefined,
        })),
      ),
    [inviteeUsers],
  );

  const inviteePickerGroups = useMemo(() => {
    // Registration events are person-only: department tags are not
    // participants, so the picker offers just the user sections.
    if (registrationType) {
      return userPickerGroups;
    }
    const rows = departmentTreeRows(
      inviteeDepartments.map((dept) => ({
        id: dept.id,
        name: dept.name,
        sortOrder: dept.sortOrder,
        parentId: dept.parentId,
      })),
    );
    return [
      ...(rows.length > 0
        ? [
            {
              label: PICKER_DEPARTMENTS_SECTION,
              options: departmentPickerOptions(rows),
            },
          ]
        : []),
      ...userPickerGroups,
    ];
  }, [inviteeDepartments, userPickerGroups, registrationType]);

  // Seed the picker dialog draft from the current form value; re-derived every
  // render so the dialog always opens on the latest selection.
  const inviteePickerValues = useMemo(() => {
    const { userIds, departmentIds } = splitInvitees(form.values.invitees);
    return selectionByGroup(inviteePickerGroups, [...userIds, ...departmentIds]);
  }, [inviteePickerGroups, form.values.invitees]);

  // Commits the badge picker draft into the form. Previously selected ids
  // that no longer appear in the picker (e.g. now-inactive users) are kept so
  // editing can't silently drop them — see `mergeInviteeSelection`. The
  // organizer is NOT forced in: attendees are exactly what was picked.
  /** Commit a new invitee tag list and clear a stale step-gate error. */
  function setInvitees(next: string[]) {
    form.setFieldValue("invitees", next);
    if (form.errors.invitees) {
      form.clearFieldError("invitees");
    }
  }

  function applyInviteePicker(values: Record<string, string[]>) {
    autoSeededSelfRef.current = false;
    setInvitees(
      mergeInviteeSelection(
        inviteePickerGroups,
        form.values.invitees,
        values,
        PICKER_DEPARTMENTS_SECTION,
      ),
    );
  }

  // Pinned-event audience: the same department tree the participant picker
  // uses, but without users. An empty selection means the pin is global (every
  // department, including future ones); selecting every current department is
  // normalized back to empty so "all" keeps that meaning.
  const pinDepartmentGroups = useMemo(() => {
    const rows = departmentTreeRows(
      inviteeDepartments.map((dept) => ({
        id: dept.id,
        name: dept.name,
        sortOrder: dept.sortOrder,
        parentId: dept.parentId,
      })),
    );
    const options = departmentPickerOptions(rows);
    return options.length > 0 ? [{ label: PICKER_DEPARTMENTS_SECTION, options }] : [];
  }, [inviteeDepartments]);
  const pinDepartmentIds = useMemo(
    () => pinDepartmentGroups.flatMap((group) => group.options.map((option) => option.id)),
    [pinDepartmentGroups],
  );
  const pinPickerValues = useMemo(
    () => selectionByGroup(pinDepartmentGroups, form.values.pinnedDepartments),
    [pinDepartmentGroups, form.values.pinnedDepartments],
  );

  function applyPinPicker(values: Record<string, string[]>) {
    const selected = Object.values(values).flat();
    const normalized =
      selected.length > 0 && selected.length === pinDepartmentIds.length ? [] : selected;
    form.setFieldValue("pinnedDepartments", normalized);
  }

  // The type step's sections: inline groups (rendered as labeled rows) first,
  // then "Ungrouped", then the folder groups (chips + popup); empty groups are
  // skipped by the builder.
  const pickerSections = useMemo(
    () => buildEventTypePickerSections(eventTypes, eventTypeGroups),
    [eventTypes, eventTypeGroups],
  );

  // The picker's normalized sections (inline row / folder chip + popup).
  const typeGridSections = useMemo(
    () =>
      pickerSections.map((section) => ({
        id: section.id,
        label: section.name,
        collapsible: section.collapsible,
        options: section.types.map((type) => ({ value: type.name, label: type.name })),
      })),
    [pickerSections],
  );

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
  /** Whether the wizard shows the Participants step (per-type toggle). */
  const showInviteesStep = registrationType
    ? true
    : selectedType
      ? selectedType.showInvitees !== false
      : true;
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
  // one input group at a time. The step list depends on the selected type
  // (location/remarks/invitees steps drop out per its config). Rebuilt each
  // render (a handful of tiny objects) because its deps derive from reactive
  // form values; the type is only ever changed on step 1, so the step index
  // stays valid when the list re-derives.
  const steps = buildSteps(showLocationStep, showRemarksStep, showInviteesStep);
  const [step, setStep] = useState(0);
  // Direction of the last step change ("forward"/"backward"), used to slide the
  // entering step in from the corresponding side (see `.wizard-step-enter` in
  // globals.css). Defaults forward so the initial step enters from the right.
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [inviteePickerOpen, setInviteePickerOpen] = useState(false);
  const [pinPickerOpen, setPinPickerOpen] = useState(false);
  // Tap-to-fill "recent locations" chips for the Location step. Fetched once,
  // best-effort, when the wizard mounts — empty on failure (chips just don't
  // render), so the TextInput always remains the custom fallback.
  const [recentLocations, setRecentLocations] = useState<string[]>([]);
  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;
  const stepPosition = `${step + 1} of ${steps.length}`;
  // The step body's scroll container. Steps swap in place inside a fixed-height
  // region (see `.c2-wizard-scroll`), so a step change must start scrolled to
  // the top even if the previous step had scrolled deep (a long type list, the
  // review step, ...).
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // True while the create form's initial self-participant is still untouched
  // (edit/duplicate forms never auto-seed). Enabling registration clears that
  // seed; a list the user edited is left alone.
  const autoSeededSelfRef = useRef(!isEdit && templateEvent === null);
  // The timed span saved when the time option leaves `range`, so switching to
  // Full/Half Day and back restores the clock times instead of leaving the
  // `00:00:00` the day-based options store (they never silently eat the edit).
  const lastRangeTimesRef = useRef<{ start: string; end: string } | null>(null);

  // On a step change: reset the body scroll and announce the arrival through
  // the shell's polite live region (the step indicator alone is not enough for
  // screen-reader users). The time-snap hint is dropped by the step navigators
  // below — it explains an edit on the Time step, so it never follows the user
  // to another step.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    announce(`Step ${stepPosition}: ${STEP_LABELS[currentStep.id]}`);
    // Intentional: only re-run when the visible step actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep.id]);

  // Load the Location step's recent-location suggestions once per open. Server
  // actions are not cancellable; ignore the result if the wizard unmounts.
  useEffect(() => {
    let cancelled = false;
    fetchRecentLocations()
      .then((locations) => {
        if (!cancelled) {
          setRecentLocations(locations);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function goBack() {
    setDirection("backward");
    setTimeSnapHint(null);
    setStep((index) => Math.max(index - 1, 0));
  }

  /**
   * Jump straight to any step (the bottom step strip). Like the old
   * "Go to Summary" link, this never validates the steps in between — the
   * final submit still catches problems and returns the user to the owning
   * step. Tapping the step you are already on is a no-op.
   */
  function goToStep(index: number) {
    if (index === step) {
      return;
    }
    setDirection(index > step ? "forward" : "backward");
    setTimeSnapHint(null);
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
    } else if (currentStep.id === "invitees" && !registrationType) {
      // Every saved event must occupy someone — say so when the user leaves
      // the step, not only at submit (registration events may start with an
      // empty roster; the submit bounce stays for strip jumps).
      if (form.values.invitees.length === 0) {
        form.setFieldError("invitees", INVITEES_REQUIRED_ERROR);
        announce(INVITEES_REQUIRED_ERROR);
        return;
      }
      form.clearFieldError("invitees");
    } else if (currentStep.fields.some((field) => form.validateField(field).hasError)) {
      return;
    }
    setDirection("forward");
    setTimeSnapHint(null);
    setStep((index) => Math.min(index + 1, steps.length - 1));
  }

  // ---- date/time ordering (the untouched side follows) ----
  // Editing one side never leaves the pair inverted: the side the user did not
  // touch moves onto the one they did (`clampEventEnd` when the start moved,
  // `clampEventStart` when the end did) and the move is named in a quiet line
  // under the controls. `validateEventForm`'s ordering error stays as the
  // submit-time safety net and as the only surface for the time-option switch
  // below, which normalizes stored values rather than editing a side.
  function syncEndOrderError(values: EventFormValues) {
    if (needsClamp(values)) {
      form.setFieldError("end", END_ORDER_ERROR);
    } else if (form.errors.end === END_ORDER_ERROR) {
      form.clearFieldError("end");
    }
  }

  /**
   * Commit a start/end edit and keep the pair ordered. `side` names the side the
   * user just edited, so the **other** side is the one that may move. An
   * incomplete opposite side never moves — its own required error surfaces.
   */
  function syncTimeOrder(patch: Partial<EventFormValues>, side: "start" | "end") {
    const next = { ...form.values, ...patch };
    if (form.errors.end === END_ORDER_ERROR) {
      form.clearFieldError("end");
    }
    if (!needsClamp(next)) {
      setTimeSnapHint(null);
      return;
    }
    const snapped = side === "start" ? clampEventEnd(next) : clampEventStart(next);
    if (snapped.end !== next.end) {
      form.setFieldValue("end", snapped.end);
    }
    if (snapped.endAmPm !== next.endAmPm) {
      form.setFieldValue("endAmPm", snapped.endAmPm);
    }
    if (snapped.start !== next.start) {
      form.setFieldValue("start", snapped.start);
    }
    if (snapped.startAmPm !== next.startAmPm) {
      form.setFieldValue("startAmPm", snapped.startAmPm);
    }
    const message = `${side === "start" ? "End" : "Start"} set to match the ${side}.`;
    setTimeSnapHint(message);
    announce(message);
  }

  function setStartField(nextStart: string) {
    form.setFieldValue("start", nextStart);
    syncTimeOrder({ start: nextStart }, "start");
  }

  function setEndField(nextEnd: string) {
    form.setFieldValue("end", nextEnd);
    syncTimeOrder({ end: nextEnd }, "end");
  }

  function setStartAmPmField(next: AmPm) {
    form.setFieldValue("startAmPm", next);
    syncTimeOrder({ startAmPm: next }, "start");
  }

  function setEndAmPmField(next: AmPm) {
    form.setFieldValue("endAmPm", next);
    syncTimeOrder({ endAmPm: next }, "end");
  }

  function switchTimeOption(option: TimeOption) {
    // Remember the timed span when leaving `range`, and restore it on the way
    // back unless the user already edited the zeroed times in the meantime —
    // a day-based round trip must not silently discard the clock times.
    const leavingRange = option !== "range" && effectiveTimeOption === "range";
    const returningToRange = option === "range" && effectiveTimeOption !== "range";
    if (leavingRange) {
      lastRangeTimesRef.current = { start: form.values.start, end: form.values.end };
    }
    const saved = returningToRange ? lastRangeTimesRef.current : null;
    const restoreTimes =
      saved !== null &&
      form.values.start.endsWith("00:00:00") &&
      form.values.end.endsWith("00:00:00");
    const baseStart = restoreTimes ? saved.start : form.values.start;
    const baseEnd = restoreTimes ? saved.end : form.values.end;
    form.setFieldValue("timeOption", option);
    // Day-based options store a bare `00:00:00` time part; compute the target
    // values up front (form.values is the pre-switch snapshot in this handler).
    const nextStart =
      option !== "range" && baseStart ? `${baseStart.slice(0, 10)} 00:00:00` : baseStart;
    const nextEnd = option !== "range" && baseEnd ? `${baseEnd.slice(0, 10)} 00:00:00` : baseEnd;
    if (option !== "range") {
      if (baseStart) {
        form.setFieldValue("start", nextStart);
      }
      if (baseEnd) {
        form.setFieldValue("end", nextEnd);
      }
    } else if (restoreTimes) {
      form.setFieldValue("start", nextStart);
      form.setFieldValue("end", nextEnd);
    }
    // Default to an AM→PM span (a mixed span renders with no title marker).
    const nextStartAmPm = option === "half" ? form.values.startAmPm || "AM" : "";
    const nextEndAmPm = option === "half" ? form.values.endAmPm || "PM" : "";
    if (option === "half") {
      if (!form.values.startAmPm) {
        form.setFieldValue("startAmPm", nextStartAmPm);
      }
      if (!form.values.endAmPm) {
        form.setFieldValue("endAmPm", nextEndAmPm);
      }
    }
    // No clamp here either: the switch only normalizes the stored values and
    // re-syncs the ordering error, so an inverted pair stays visible and fixable.
    syncEndOrderError({
      ...form.values,
      timeOption: option,
      start: nextStart,
      end: nextEnd,
      startAmPm: nextStartAmPm,
      endAmPm: nextEndAmPm,
    } as EventFormValues);
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
    // A type with remarks or invitees disabled stores neither field (mirrors
    // resolveEventFields on the write path) — but the typed values STAY in the
    // form so switching back restores them; `effectiveFreeText` /
    // `effectiveInviteeTags` keep the preview, review and payload honest.
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
  // The organizer is never auto-added as a participant — {people} tokens and
  // the review derive from the actual invitee selection. The tags the SAVE
  // carries mirror the write path (`resolveEventFields`): registration events
  // are person-only, and a type whose Participants step is hidden stores the
  // organizer as its sole attendee (there is no step on which anyone could
  // self-invite). The raw `form.values.invitees` keeps everything typed, so
  // toggling registration or the type back restores the full selection.
  const effectiveCreatorId = form.values.creatorId || currentUser;
  const effectiveInvitees = effectiveInviteeTags({
    invitees: form.values.invitees,
    registrationType,
    showInviteesStep,
    creatorId: effectiveCreatorId,
  });
  // The free-text fields the save carries (a type with remarks disabled
  // stores neither) — the form keeps the typed text for a switch back.
  const effectiveText = effectiveFreeText({
    title: form.values.title,
    remarks: form.values.remarks,
    showRemarksStep,
  });
  // The attendees the save carries, for the invitee step's summary badges, the
  // notify diff and the review — everything the user can see matches the save.
  const selectedInvitees = splitInvitees(effectiveInvitees);
  // The invitee step's summary badges, in display order: users first (the
  // creator in brand, the signed-in user as an amber "mine" badge, everyone
  // else default) then tagged departments in accent.
  const inviteeSummaryItems: PickerBadgeItem[] = [
    ...selectedInvitees.userIds.flatMap((id) => {
      const person = peopleById[id];
      return person
        ? [
            {
              key: `user:${id}`,
              label: person.full,
              color: id === form.values.creatorId ? "brand" : undefined,
              self: id === currentUser,
            },
          ]
        : [];
    }),
    ...selectedInvitees.departmentIds.flatMap((id) => {
      const name = departmentNames[id];
      return name ? [{ key: `dept:${id}`, label: name, color: "accent" }] : [];
    }),
  ];
  // Pin-audience summary badges; an empty list renders the "All departments"
  // badge in the settings step. The chip key is the bare department id, so the
  // ✕ removes exactly what the dialog would have un-ticked.
  const pinSummaryItems: PickerBadgeItem[] = form.values.pinnedDepartments.flatMap((id) => {
    const name = departmentNames[id];
    return name ? [{ key: id, label: name, color: "accent" }] : [];
  });
  const pinnedAudienceLabel =
    pinSummaryItems.length === 0
      ? "All departments"
      : pinSummaryItems.length === 1
        ? pinSummaryItems[0].label
        : `${pinSummaryItems.length} departments`;
  // Quick self add/remove state for the Participants step's toggle button.
  const selfIncluded = selectedInvitees.userIds.includes(currentUser);
  // Tag-level mirror of the server's participant diff
  // (`participantNotify/diff.ts`): participants this save newly includes,
  // which is exactly who a push could reach. Departments compare by tag —
  // roster membership changes never happen inside this wizard — and the
  // acting user never counts (the server filters them out too). Zero means
  // the review step's notify switch would have nothing to switch off.
  const addedParticipantCount =
    selectedInvitees.userIds.filter(
      (id) =>
        id !== currentUser && !(isEdit && event ? event.payload.inviteeUserIds : []).includes(id),
    ).length +
    selectedInvitees.departmentIds.filter(
      (id) => !(isEdit && event ? event.payload.inviteeDepartmentIds : []).includes(id),
    ).length;

  // Live rendering of the exact title the server will write to Google, so the
  // user sees the final calendar summary (template tokens) before submitting.
  // Also show the per-view display title when it differs.
  const previewTitles = (() => {
    const people: EventTitlePerson[] = effectiveInvitees
      .filter((value) => value.startsWith("user:"))
      .map((value) => value.slice("user:".length))
      .map((id) => peopleById[id])
      .filter((person): person is EventTitlePerson => Boolean(person));
    const departments = effectiveInvitees
      .filter((value) => value.startsWith("dept:"))
      .map((value) => value.slice("dept:".length))
      .map((id) => departmentNames[id])
      .filter((name): name is string => Boolean(name));
    const input: EventTitleRecipeInput = {
      description: effectiveText.title,
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
    const render = (recipe: TitleRecipe) => {
      return renderTitleRecipe(input, recipe) || form.values.title.trim();
    };
    const viewRecipe = viewEventTitleRecipe ?? eventTitleRecipe;
    const isSame = JSON.stringify(viewRecipe) === JSON.stringify(eventTitleRecipe);
    const master = render(eventTitleRecipe);
    const view = isSame ? master : render(viewRecipe);
    return { master, view, isSame };
  })();

  // Review-step display values — resolved from the same effective state the
  // submit payload uses, so what the user reviews is exactly what gets saved.
  // The organizer is shown in its own row below; participants (the review's
  // Participants row) are exactly the tagged people, so an organizer who
  // self-invited appears among them too. Id-keyed (not name-keyed) so the
  // signed-in user is detectable even when display names collide.
  const reviewPeople = (() => {
    const entries = new Map<string, string>();
    for (const value of effectiveInvitees) {
      if (!value.startsWith("user:")) {
        continue;
      }
      const id = value.slice("user:".length);
      const person = peopleById[id];
      if (person && !entries.has(id)) {
        entries.set(id, person.fqn);
      }
    }
    return [...entries].map(([id, name]) => ({ id, name }));
  })();
  const reviewDepartments = [
    ...new Set(
      effectiveInvitees
        .filter((value) => value.startsWith("dept:"))
        .map((value) => departmentNames[value.slice("dept:".length)])
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  // The review always names the organizer (fixed at creation to the acting
  // user; stored on the event thereafter).
  const creatorName = peopleById[effectiveCreatorId]?.fqn ?? null;
  // The organizer-only edit lock may only be changed by the organizer (or an
  // admin) — invitees editing the event keep the stored lock server-side.
  // Keyed off the STORED organizer (not the form's seed fallback, which shows
  // the acting user on a creator-less event): a non-admin editing a
  // creator-less event would otherwise see a switch the server silently drops
  // (canChangeLock is false while no organizer is stored). The acting user is
  // adopted as the stored organizer on that save, so the switch appears from
  // their next edit.
  const storedCreatorId = isEdit ? (event?.payload.creatorId ?? null) : null;
  const canSetOwnerLock = isEdit ? isAdmin || storedCreatorId === currentUser : true;
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
    const { invitees, title, remarks, ...rest } = values;
    // The payload carries exactly what the server will store (the same drop
    // `resolveEventFields` applies); the form keeps the raw values.
    const { userIds, departmentIds } = splitInvitees(
      effectiveInviteeTags({
        invitees,
        registrationType,
        showInviteesStep,
        creatorId: values.creatorId || currentUser,
      }),
    );
    const text = effectiveFreeText({ title, remarks, showRemarksStep });
    return {
      ...rest,
      title: text.title,
      remarks: text.remarks,
      timeOption: effectiveTimeOption,
      startAmPm: effectiveTimeOption === "half" ? rest.startAmPm || "AM" : "",
      endAmPm: effectiveTimeOption === "half" ? rest.endAmPm || "PM" : "",
      inviteeUserIds: userIds,
      inviteeDepartments: departmentIds,
      pinnedDepartments: rest.pinned ? rest.pinnedDepartments : [],
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

  // Post-save confirmation, styled per the `savedEventToastVariant` feature
  // flag. `eventId` is the group id returned by the server (a string, so the
  // toast faces can capture it directly without a stale-closure risk).
  const showSavedEventConfirmation = (updated: boolean, eventId: string | null) => {
    const savedTitle = updated ? "Event updated" : "Event created";
    const variant = savedEventToastVariant ?? "pill";
    if (variant === "toastPlain") {
      notifications.show({ color: "green", message: savedTitle });
      return;
    }
    if (variant === "toastAction") {
      const toastId = crypto.randomUUID();
      notifications.show({
        id: toastId,
        color: "green",
        title: savedTitle,
        message: (
          <Button
            size="compact-sm"
            variant="light"
            color="brand"
            onClick={() => {
              notifications.hide(toastId);
              onViewSaved?.(eventId);
            }}
          >
            View event
          </Button>
        ),
      });
      return;
    }
    showActionPill({
      title: savedTitle,
      label: "View event",
      variant: variant === "pillRestyle" ? "toast" : "default",
      onAction: () => onViewSaved?.(eventId),
    });
  };

  const onSubmit = form.onSubmit(
    async (values) => {
      // The submit button only renders on the last step; guard against
      // implicit form submission (e.g. Enter in a textbox) from earlier steps.
      if (!isLastStep) {
        return;
      }
      // Offline: the disabled button already says why; this covers implicit
      // submission (Enter in a textbox) so no doomed write is even attempted.
      if (offline) {
        announce("You're offline. Reconnect to submit — minimizing keeps your draft.");
        return;
      }
      const payload = valuesToPayload(values);
      // Every saved event must occupy someone (a type with invitees disabled
      // always carries the organizer, so only the Participants step's type can
      // reach zero). Bounce back to the step before building any optimistic
      // chip — a blocked save must leave no stand-in behind.
      if (
        !registrationType &&
        showInviteesStep &&
        payload.inviteeUserIds.length === 0 &&
        payload.inviteeDepartments.length === 0
      ) {
        notifications.show({ color: "red", message: INVITEES_REQUIRED_ERROR });
        const inviteesIndex = steps.findIndex((s) => s.id === "invitees");
        if (inviteesIndex >= 0) {
          goToStep(inviteesIndex);
        }
        return;
      }
      // Recurring mutations have no single stand-in chip (Google expands the
      // series, and a single-occurrence edit is an exception); the refresh
      // after the action paints the authoritative occurrences.
      const skipOptimistic =
        Boolean(payload.recurrence) || scope !== null || Boolean(event?.payload.recurringEventId);
      const optimisticId = skipOptimistic ? null : nextOptimisticOpId();
      if (optimisticId) {
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
      }

      const result: EventActionResult = isEdit
        ? await updateEvent(eventRefFromCalendarEvent(event), payload, scope ?? undefined, {
            notify: notifyParticipants,
          })
        : await createEvent(payload, { notify: notifyParticipants });

      if (result.ok) {
        // Pin the stand-in to the server's group/copy ids, then let the
        // authoritative refresh swap it out (see DashboardView).
        if (optimisticId) {
          onOptimisticSettled(optimisticId, result);
        }
        onDone();
        // Post-save confirmation, styled per the `savedEventToastVariant`
        // feature flag (Settings → Feature Flags): the classic two-tone pill,
        // a confirmation-styled pill, a standard toast with a "View event"
        // action, or a plain toast. The classic/restyled pill resolve their
        // click target from the optimistic stand-in via the latest-ref behind
        // `onViewSaved`, so the details modal opens before the post-save
        // refresh lands; the toast faces capture `eventId` directly.
        showSavedEventConfirmation(isEdit, result.eventId);
        return;
      }

      // The action rejected (field or server error) — drop the stand-in so the
      // grid shows the pre-submit state while the form surfaces the error.
      if (optimisticId) {
        onOptimisticRollback(optimisticId);
      }

      if (result.field) {
        const failedField = result.field;
        form.setFieldError(failedField, result.error);
        // Land the user on the step that owns the failing field.
        const target = steps.findIndex((s) => s.id === STEP_BY_FIELD[failedField]);
        if (target >= 0) {
          goToStep(target);
        }
      }
      notifications.show({ color: "red", message: result.error });
    },
    // Client-side failure on the final submit (e.g. end before start): toast,
    // and land the user on the step that owns the first failing field — a
    // step-strip jump can skip the Time step, so the flagged control may not be
    // mounted yet.
    (errors) => {
      showValidationFailure(errors, (field) => form.getInputNode(field));
      const failedField = firstErrorField(errors);
      const owner = failedField
        ? STEP_BY_FIELD[failedField as keyof typeof STEP_BY_FIELD]
        : undefined;
      const target = owner ? steps.findIndex((s) => s.id === owner) : -1;
      if (target >= 0) {
        goToStep(target);
      }
    },
  );

  const showTabs = allowedOptions.length > 1;

  const timeFields = (option: TimeOption) => {
    // Only Half Day carries half-of-day markers; Full Day is a plain range.
    const showAmPm = option === "half";
    // Editing a side snaps the other side onto it (syncTimeOrder), so the
    // validator's ordering error only surfaces from the time-option switch or
    // a submit. When it does, land it on the control that actually mismatches:
    // a differing date under the End date, a same-date time under the End
    // time, and a same-date Half Day marker under the End AM/PM.
    const startDate = naiveDatePart(form.values.start);
    const endDate = naiveDatePart(form.values.end);
    const startTime = naiveTimePart(form.values.start);
    const endTime = naiveTimePart(form.values.end);
    const sameDate = !!startDate && startDate === endDate;
    const endOrderError = form.errors.end === END_ORDER_ERROR ? END_ORDER_ERROR : undefined;
    const endOrderOnTime = !!endOrderError && sameDate && option === "range";
    const endOrderOnMarker = !!endOrderError && sameDate && showAmPm;
    const endOrderOnDate = !!endOrderError && !endOrderOnTime && !endOrderOnMarker;
    // Start & End stores date and time in one naive string per side, so the
    // validator error lands on the widget at fault: a missing date under the
    // date input, a missing time under the time input.
    const dateError = (field: "start" | "end") => {
      if (field === "end" && endOrderOnDate) {
        return endOrderError;
      }
      return form.values[field] ? undefined : form.errors[field];
    };
    const timeError = (field: "start" | "end") => {
      if (field === "end" && endOrderOnDate) {
        return undefined;
      }
      if (field === "end" && endOrderOnTime) {
        return endOrderError;
      }
      return form.values[field] ? form.errors[field] : undefined;
    };
    // Neither date pickers nor the time pickers carry cross-side bounds: an
    // out-of-order pick is accepted and the opposite side snaps onto it (see
    // syncTimeOrder), so either side can be set first without fighting limits.
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
            attributes={{ input: { readOnly: true } }}
            popoverProps={{ trapFocus: false }}
          />
          <TimeSelectField
            label="Start time"
            value={startTime}
            onChange={(time) =>
              setStartField(joinDateTimeParts(naiveDatePart(form.values.start), time))
            }
            error={timeError("start")}
          />
        </Stack>
      ) : (
        <>
          <DatePickerInput
            label="Start date"
            value={naiveToDate(form.values.start)}
            onChange={(value) => setStartField(value ? `${value} 00:00:00` : "")}
            error={form.errors.start}
            attributes={{ input: { readOnly: true } }}
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
            attributes={{ input: { readOnly: true } }}
            popoverProps={{ trapFocus: false }}
          />
          <TimeSelectField
            label="End time"
            value={endTime}
            onChange={(time) =>
              setEndField(joinDateTimeParts(naiveDatePart(form.values.end), time))
            }
            error={timeError("end")}
          />
        </Stack>
      ) : (
        <>
          <DatePickerInput
            label="End date"
            value={naiveToDate(form.values.end)}
            onChange={(value) => setEndField(value ? `${value} 00:00:00` : "")}
            error={endOrderOnMarker ? undefined : form.errors.end}
            attributes={{ input: { readOnly: true } }}
          />
          {showAmPm && (
            <Stack gap={4}>
              <SegmentedControl
                aria-label="End AM or PM"
                data={AMPM_OPTIONS}
                value={form.values.endAmPm || undefined}
                onChange={(value) => setEndAmPmField(value as AmPm)}
              />
              {(endOrderOnMarker || form.errors.endAmPm) && (
                <Text size="xs" c="red">
                  {endOrderOnMarker ? endOrderError : form.errors.endAmPm}
                </Text>
              )}
            </Stack>
          )}
        </>
      );
    // The modal is wide enough at lg for start/end side by side.
    const fields = isDesktop ? (
      <Grid gap="sm">
        <Grid.Col span={6}>{startField}</Grid.Col>
        <Grid.Col span={6}>{endField}</Grid.Col>
      </Grid>
    ) : (
      <>
        {startField}
        {endField}
      </>
    );
    // Quiet line naming the side that just moved onto the edited one; the
    // collapse keeps the step height stable when nothing snapped.
    return (
      <>
        {fields}
        <Collapse
          expanded={Boolean(timeSnapHint)}
          transitionDuration={motion.duration.quick}
          transitionTimingFunction={motion.easing.out}
        >
          <Text size="xs" c="dimmed">
            {timeSnapHint}
          </Text>
        </Collapse>
      </>
    );
  };

  // Review-step definition rows: each is a caption + value pair. On the wide
  // modal (>= 800px viewport, lg host width) they reflow into a two-column
  // grid so the added width reads as structure — the calendar preview and
  // clash check above stay full-width. A row with a `jumpTo` step is the way
  // back to its fields: the whole row is the target (quiet hover fill, shared
  // focus ring — `.c2-review-jump`), so reviewing means tapping what changed,
  // not hunting the step strip. Both branches share `.c2-review-row` (the row
  // box = the content column: 8px inner padding, no inline negative margin, so
  // nothing overflows the horizontally clipped review body and labels align).
  const reviewDef = (label: string, node: ReactNode, jumpTo?: StepId) => {
    const body = (
      <>
        <Text size="xs" c="dimmed" fw={600}>
          {label}
        </Text>
        {node}
      </>
    );
    const target = jumpTo ? steps.findIndex((s) => s.id === jumpTo) : -1;
    if (!jumpTo || target < 0) {
      // Inert rows carry the same box class as the jump rows, so their labels
      // stay aligned (the row box is the content column — `.c2-review-row`).
      return (
        <Stack gap={4} className="c2-review-row">
          {body}
        </Stack>
      );
    }
    return (
      <UnstyledButton
        type="button"
        className="c2-review-jump c2-review-row"
        aria-label={`Edit ${label}`}
        onClick={() => goToStep(target)}
      >
        <Stack gap={4}>{body}</Stack>
      </UnstyledButton>
    );
  };
  const reviewSections: Array<{ key: string; span: number; node: ReactNode }> = [
    {
      key: "when",
      span: 6,
      node: reviewDef("When", <Text size="sm">{whenText || "—"}</Text>, "time"),
    },
    ...(scope !== "single" && recurrence
      ? [
          {
            key: "repeat",
            span: 6,
            node: reviewDef("Repeats", <Text size="sm">{recurrenceText}</Text>, "settings"),
          },
        ]
      : []),
    ...(showLocationStep
      ? [
          {
            key: "location",
            span: 6,
            node: reviewDef(
              "Location",
              <Group gap={6} wrap="wrap">
                <Badge variant="light" color={effectiveOutOfCamp.outOfCamp ? "yellow" : "green"}>
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
              </Group>,
              "location",
            ),
          },
        ]
      : []),
    {
      key: "type",
      span: 6,
      node: reviewDef(
        "Event Type",
        <Group gap={6} wrap="wrap">
          {form.values.eventType ? (
            <Badge variant="light">{form.values.eventType}</Badge>
          ) : (
            <Text size="sm" c="dimmed">
              —
            </Text>
          )}
        </Group>,
        "type",
      ),
    },
    {
      key: "organizer",
      span: 6,
      node: reviewDef(
        "Organizer",
        <Group gap={6} wrap="wrap">
          {creatorName ? (
            <Badge variant="light" color="brand">
              {creatorName}
            </Badge>
          ) : (
            <Text size="sm" c="dimmed">
              {effectiveCreatorId === currentUser ? "You" : "—"}
            </Text>
          )}
        </Group>,
      ),
    },
    // The Participants row shows even when empty: on a normal event zero
    // people is the one rule violation the review must FLAG (the step gate
    // catches it on the walk; this catches strip jumps), while a registration
    // event may legitimately start with an empty roster.
    ...(showInviteesStep
      ? [
          {
            key: "people",
            span: 6,
            node: reviewDef(
              registrationType ? "Registered" : "Participants",
              reviewPeople.length > 0 ? (
                <Group gap={6} wrap="wrap">
                  {reviewPeople.map((person) => (
                    <Badge
                      key={person.id}
                      variant="light"
                      className={person.id === currentUser ? "c2-my-badge" : undefined}
                    >
                      {person.id === currentUser ? `${person.name} (You)` : person.name}
                    </Badge>
                  ))}
                </Group>
              ) : registrationType ? (
                <Text size="sm" c="dimmed">
                  No registrants yet
                </Text>
              ) : reviewDepartments.length > 0 ? (
                // Departments alone satisfy the rule — the Departments row
                // below names them; this row just has no people to show.
                <Text size="sm" c="dimmed">
                  —
                </Text>
              ) : (
                <Text size="sm" c="red">
                  None yet — add at least one participant or department
                </Text>
              ),
              "invitees",
            ),
          },
        ]
      : []),
    ...(registrationType
      ? [
          {
            key: "registrationCap",
            span: 6,
            node: reviewDef(
              "Registration limit",
              <Text size="sm">
                {form.values.registrationCap != null
                  ? `${selectedInvitees.userIds.length} / ${form.values.registrationCap}`
                  : `No limit (${selectedInvitees.userIds.length} registered)`}
              </Text>,
              "settings",
            ),
          },
        ]
      : []),
    ...(reviewDepartments.length > 0
      ? [
          {
            key: "departments",
            span: 6,
            node: reviewDef(
              "Departments",
              <Group gap={6} wrap="wrap">
                {reviewDepartments.map((name) => (
                  <Badge key={name} variant="light" color="accent">
                    {name}
                  </Badge>
                ))}
              </Group>,
              "invitees",
            ),
          },
        ]
      : []),
    ...(showRemarksStep
      ? [
          {
            key: "description",
            span: 12,
            node: reviewDef(
              "Description",
              <Text size="sm" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                {form.values.title.trim() || "—"}
              </Text>,
              "remarks",
            ),
          },
        ]
      : []),
    ...(showRemarksStep && form.values.remarks?.trim()
      ? [
          {
            key: "remarks",
            span: 12,
            node: reviewDef(
              "Remarks",
              <Text size="sm" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                {form.values.remarks.trim()}
              </Text>,
              "remarks",
            ),
          },
        ]
      : []),
    ...(form.values.pinned || form.values.ownerOnlyEdits || registrationType
      ? [
          {
            key: "other-settings",
            span: 12,
            node: reviewDef(
              "Other settings",
              <Group gap={6} wrap="wrap">
                {form.values.pinned && (
                  <Badge variant="light" color="accent">
                    Pinned: {pinnedAudienceLabel}
                  </Badge>
                )}
                {registrationType && (
                  <Badge variant="light" color="accent">
                    Registration event
                  </Badge>
                )}
                {!registrationType && form.values.ownerOnlyEdits && (
                  <Badge variant="light" color="red">
                    Organizer-only editing
                  </Badge>
                )}
              </Group>,
              "settings",
            ),
          },
        ]
      : []),
  ];

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={handleFormKeyDown}
      className={`c2-event-wizard${verticalSteps ? " c2-event-wizard--split" : ""}`}
      style={{ height: bodyHeight }}
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
                <EmptyState
                  icon={<IconCalendarEvent size={22} />}
                  description={
                    isAdmin
                      ? "No event types exist yet. Add them in Settings → Event Types, then reopen the wizard."
                      : "No event types exist yet. Ask an admin to add them in Settings → Event Types."
                  }
                  actionLabel={isAdmin ? "Open Event Types" : undefined}
                  actionHref="/settings/event-types"
                />
              ) : (
                <>
                  {/* No "currently selected" banner: the chosen type is the one
                      amber badge in the grid, and tapping it again clears the
                      pick (the folder pills' yellow outline says which group
                      holds it). */}
                  {/* Inline groups -> labeled rows; folder groups -> chips with a
                      popup of that group's types. */}
                  <EventTypeGroupGrid
                    sections={typeGridSections}
                    isSelected={(value) => value === form.values.eventType}
                    onToggle={(value) =>
                      handleEventTypeChange(form.values.eventType === value ? null : value)
                    }
                  />
                </>
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
              {recentLocations.length > 0 && (
                <Stack gap={6}>
                  <Text size="xs" c="dimmed" fw={500}>
                    Recent locations
                  </Text>
                  <Group gap={6} wrap="wrap">
                    {recentLocations.map((location) => {
                      const selected =
                        location.trim().toLocaleLowerCase() ===
                        form.values.location.trim().toLocaleLowerCase();
                      return (
                        <UnstyledButton
                          key={location}
                          aria-pressed={selected}
                          aria-label={`${location}${selected ? ", selected" : ""}`}
                          onClick={() => form.setFieldValue("location", location)}
                          style={{ cursor: "pointer", borderRadius: "var(--mantine-radius-md)" }}
                        >
                          <Badge
                            variant={selected ? "filled" : "light"}
                            size="lg"
                            styles={{
                              root: {
                                minHeight: "var(--c2-chip-height)",
                                height: "auto",
                                paddingBlock: 4,
                              },
                            }}
                          >
                            {location}
                          </Badge>
                        </UnstyledButton>
                      );
                    })}
                  </Group>
                </Stack>
              )}
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
              {scope === "single" ? (
                <Stack gap={6}>
                  <Text size="sm" c="dimmed">
                    Participants are series-level: they apply to every occurrence. Choose “All
                    events” on Edit to change them.
                  </Text>
                  <PickerBadges items={inviteeSummaryItems} />
                </Stack>
              ) : (
                <>
                  {inviteePickerGroups.length > 0 ? (
                    <>
                      <PickerField
                        label={registrationType ? "Registered attendees" : "Participants"}
                        description={
                          registrationType
                            ? "Starting roster for each occurrence. The organizer is not added automatically — add yourself only if you'll attend. People can register themselves for each occurrence; only you and admins can edit the series. Departments can't be tagged on registration events."
                            : "Participants can edit this event too. You're in by default — remove yourself if you won't take part; an event must keep at least one participant or department"
                        }
                        items={inviteeSummaryItems}
                        onRemove={(item) =>
                          // One tap on a chip's ✕ un-tags that person or department —
                          // the same prefixed key the dialog commits with.
                          setInvitees(removeInvitee(form.values.invitees, item.key))
                        }
                        onOpen={() => setInviteePickerOpen(true)}
                      />
                      {form.errors.invitees && (
                        <Text size="xs" c="red">
                          {form.errors.invitees}
                        </Text>
                      )}
                    </>
                  ) : (
                    <EmptyState
                      icon={<IconUsers size={22} />}
                      description="No active users or departments to tag yet. Ask an admin to add people in Settings → Users."
                    />
                  )}
                  {peopleById[currentUser] && (
                    <Button
                      variant="subtle"
                      color="brand"
                      size="compact-xs"
                      // Touch-target floor (docs/accessibility.md §1.9): the
                      // compact glyph stays, the hit row grows to 44px.
                      styles={{ root: { minHeight: "2.75rem" } }}
                      style={{ alignSelf: "flex-start" }}
                      leftSection={
                        selfIncluded ? (
                          <IconUserMinus size={14} stroke={1.5} />
                        ) : (
                          <IconUserPlus size={14} stroke={1.5} />
                        )
                      }
                      onClick={() => {
                        autoSeededSelfRef.current = false;
                        setInvitees(toggleInviteeUser(form.values.invitees, currentUser));
                      }}
                    >
                      {selfIncluded ? "Remove myself" : "Add myself"}
                    </Button>
                  )}
                </>
              )}
              <UserSelectModal
                opened={inviteePickerOpen}
                onClose={() => setInviteePickerOpen(false)}
                groups={inviteePickerGroups}
                values={inviteePickerValues}
                onConfirm={applyInviteePicker}
                zIndex={300}
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
            <Stack gap="sm">
              <Textarea
                label="Description"
                description="Text in Event Title."
                placeholder="Add a description"
                autosize
                minRows={2}
                maxRows={4}
                style={{ resize: "none" }}
                {...form.getInputProps("title")}
              />
              <Textarea
                label="Remarks"
                description="Notes for the event. Support links/URLs."
                placeholder="Add remarks"
                autosize
                minRows={2}
                maxRows={4}
                style={{ resize: "none" }}
                {...form.getInputProps("remarks")}
              />
            </Stack>
          </div>
        )}

        {/* Other settings: repeat controls + pin + the organizer-only edit lock
            + per-event registration, grouped on their own always-present step
            before the read-only review. The ownership controls are only relevant
            when the acting user is the organizer or an admin (`canSetOwnerLock`);
            other editors never see them. Registration requires the lock. */}
        {currentStep.id === "settings" && (
          <div
            key={currentStep.id}
            className="wizard-step-enter"
            style={{ "--slide-dir": direction === "forward" ? 1 : -1 } as React.CSSProperties}
          >
            <Stack gap="sm">
              {scope === "single" ? (
                <Text size="sm" c="dimmed">
                  Pin, organizer-only editing and registration apply to the whole series. Choose
                  “All events” on Edit to change them.
                </Text>
              ) : (
                <>
                  <WizardSection title="Repeat">
                    <Switch
                      label="Repeats"
                      description="Create a repeating series. Changing the pattern later resets individually edited occurrences."
                      checked={Boolean(recurrence)}
                      onChange={(event) => toggleRepeats(event.currentTarget.checked)}
                    />
                    {recurrence && (
                      <Stack gap="sm">
                        <NoKeyboardSelect
                          label="Frequency"
                          data={[
                            { value: "daily", label: "Daily" },
                            { value: "weekly", label: "Weekly" },
                            { value: "monthly", label: "Monthly" },
                            { value: "yearly", label: "Yearly" },
                          ]}
                          value={recurrence.freq}
                          allowDeselect={false}
                          onChange={(value) => {
                            if (value) {
                              changeFrequency(value);
                            }
                          }}
                        />
                        <Group gap="xs" align="flex-end" wrap="nowrap">
                          <NumberInput
                            label="Every"
                            w={88}
                            min={1}
                            max={MAX_RECURRENCE_INTERVAL}
                            allowDecimal={false}
                            clampBehavior="blur"
                            hideControls
                            value={recurrence.interval}
                            onChange={(value) =>
                              updateRecurrence({
                                interval:
                                  typeof value === "number"
                                    ? Math.min(
                                        MAX_RECURRENCE_INTERVAL,
                                        Math.max(1, Math.trunc(value)),
                                      )
                                    : 1,
                              })
                            }
                          />
                          <Text size="sm" pb={6}>
                            {recurrence.freq === "daily"
                              ? recurrence.interval === 1
                                ? "day"
                                : "days"
                              : recurrence.freq === "weekly"
                                ? recurrence.interval === 1
                                  ? "week"
                                  : "weeks"
                                : recurrence.freq === "monthly"
                                  ? recurrence.interval === 1
                                    ? "month"
                                    : "months"
                                  : recurrence.interval === 1
                                    ? "year"
                                    : "years"}
                          </Text>
                        </Group>
                        {recurrence.freq === "weekly" && (
                          <Stack gap={6}>
                            <Text size="sm" fw={500}>
                              Repeat on
                            </Text>
                            <Group gap={6} wrap="wrap">
                              {WEEKDAY_PICKER_ORDER.map((day) => {
                                const selected = (recurrence.byWeekday ?? []).includes(day);
                                return (
                                  <UnstyledButton
                                    key={day}
                                    type="button"
                                    aria-pressed={selected}
                                    aria-label={`${WEEKDAY_LABELS[day]}${selected ? ", selected" : ""}`}
                                    onClick={() => toggleWeekday(day)}
                                    style={{ cursor: "pointer" }}
                                  >
                                    <Badge
                                      size="lg"
                                      variant={selected ? "filled" : "light"}
                                      styles={{
                                        root: { minHeight: "var(--c2-chip-height)" },
                                      }}
                                    >
                                      {WEEKDAY_LABELS[day]}
                                    </Badge>
                                  </UnstyledButton>
                                );
                              })}
                            </Group>
                          </Stack>
                        )}
                        <Stack gap={6}>
                          <Text size="sm" fw={500}>
                            Ends
                          </Text>
                          <SegmentedControl
                            fullWidth
                            aria-label="Repeat duration"
                            value={recurrenceDuration}
                            data={[
                              { value: "forever", label: "Forever" },
                              { value: "count", label: "After" },
                              { value: "until", label: "Until" },
                            ]}
                            onChange={changeDuration}
                          />
                          {recurrenceDuration === "count" && (
                            <Group gap="xs" align="center" wrap="nowrap">
                              <NumberInput
                                aria-label="Number of occurrences"
                                w={88}
                                min={2}
                                max={MAX_RECURRENCE_COUNT}
                                allowDecimal={false}
                                clampBehavior="blur"
                                hideControls
                                value={recurrence.count ?? 10}
                                onChange={(value) =>
                                  updateRecurrence({
                                    count:
                                      typeof value === "number"
                                        ? Math.min(
                                            MAX_RECURRENCE_COUNT,
                                            Math.max(2, Math.trunc(value)),
                                          )
                                        : 10,
                                  })
                                }
                              />
                              <Text size="sm">occurrences</Text>
                            </Group>
                          )}
                          {recurrenceDuration === "until" && (
                            <DatePickerInput
                              aria-label="Repeat until"
                              valueFormat="YYYY-MM-DD"
                              placeholder="End date"
                              value={recurrence.until ?? null}
                              minDate={
                                /^\d{4}-\d{2}-\d{2}$/.test(form.values.start.slice(0, 10))
                                  ? new Date(`${form.values.start.slice(0, 10)}T00:00:00`)
                                  : undefined
                              }
                              onChange={(value) =>
                                updateRecurrence({
                                  until: value ? String(value).slice(0, 10) : null,
                                })
                              }
                              attributes={{ input: { readOnly: true } }}
                              popoverProps={{ trapFocus: false }}
                            />
                          )}
                        </Stack>
                        <Text size="xs" c="dimmed">
                          {recurrenceText}
                        </Text>
                        {form.errors.recurrence && (
                          <Text size="xs" c="red">
                            {form.errors.recurrence}
                          </Text>
                        )}
                      </Stack>
                    )}
                  </WizardSection>
                  <WizardSection title="Pinned events">
                    <Switch
                      label="Pin this event"
                      description="Show this event in the Pinned Events panel and header ticker for the departments you choose."
                      {...form.getInputProps("pinned", { type: "checkbox" })}
                    />
                    {form.values.pinned && (
                      <>
                        <PickerField
                          label="Visible to"
                          description="Leave empty to show it to every department, including ones created later. A pin also reaches sub-departments."
                          items={pinSummaryItems}
                          onRemove={(item) =>
                            // Clearing the last chip is the same as the dialog's empty
                            // selection: the pin goes back to every department.
                            form.setFieldValue(
                              "pinnedDepartments",
                              form.values.pinnedDepartments.filter((id) => id !== item.key),
                            )
                          }
                          empty={
                            <Badge variant="light" color="accent">
                              All departments
                            </Badge>
                          }
                          triggerLabel="Choose"
                          onOpen={() => setPinPickerOpen(true)}
                        />
                        <UserSelectModal
                          opened={pinPickerOpen}
                          onClose={() => setPinPickerOpen(false)}
                          groups={pinDepartmentGroups}
                          values={pinPickerValues}
                          onConfirm={applyPinPicker}
                          title="Pin to departments"
                          zIndex={300}
                        />
                      </>
                    )}
                  </WizardSection>
                  {canSetOwnerLock && (
                    <WizardSection title="Editing & registration">
                      <Switch
                        label={
                          effectiveCreatorId === currentUser
                            ? "Only I can edit this event"
                            : "Only the organizer can edit this event"
                        }
                        description="Participants and tagged department members lose edit rights; admins always keep them. Required for registration events."
                        checked={form.values.ownerOnlyEdits}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          form.setFieldValue("ownerOnlyEdits", checked);
                          if (!checked) {
                            form.setFieldValue("registrationEnabled", false);
                            form.setFieldValue("registrationCap", null);
                          }
                        }}
                      />
                      <Switch
                        label="Open for registration"
                        description={
                          registrationType
                            ? "Anyone who can see the event can register or deregister themselves for each occurrence. Only you and admins can edit the series or manage its starting roster."
                            : "Let people register or deregister themselves for each occurrence. Requires the organizer-only edit lock above."
                        }
                        disabled={!form.values.ownerOnlyEdits}
                        checked={registrationType}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          form.setFieldValue("registrationEnabled", checked);
                          if (checked) {
                            form.setFieldValue("ownerOnlyEdits", true);
                            // Tagged departments STAY in the form (registration
                            // is person-only on the save — `effectiveInviteeTags`
                            // drops them there, like the write path), so
                            // switching registration back off restores the
                            // full selection instead of losing it silently.
                            // The organizer is not registered automatically.
                            if (
                              autoSeededSelfRef.current &&
                              form.values.invitees.length === 1 &&
                              form.values.invitees[0] === `user:${currentUser}`
                            ) {
                              autoSeededSelfRef.current = false;
                              setInvitees([]);
                            }
                          } else {
                            form.setFieldValue("registrationCap", null);
                          }
                        }}
                      />
                      {registrationType && (
                        <Stack gap="xs">
                          <Switch
                            label="Limit registrations"
                            description="Cap self-service registrations per occurrence. You and admins can still add or remove participants beyond it; departments are not participants on registration events."
                            checked={form.values.registrationCap != null}
                            onChange={(event) => {
                              if (!event.currentTarget.checked) {
                                form.setFieldValue("registrationCap", null);
                                return;
                              }
                              form.setFieldValue(
                                "registrationCap",
                                Math.max(1, selectedInvitees.userIds.length || 10),
                              );
                            }}
                          />
                          {form.values.registrationCap != null && (
                            <Stack gap={6}>
                              <NumberInput
                                label="Maximum registrations"
                                description="People can register until this many explicit registrants are on the event."
                                min={1}
                                allowDecimal={false}
                                clampBehavior="blur"
                                hideControls
                                value={form.values.registrationCap}
                                error={form.errors.registrationCap}
                                onChange={(value) =>
                                  form.setFieldValue(
                                    "registrationCap",
                                    typeof value === "number"
                                      ? Math.max(1, Math.trunc(value))
                                      : null,
                                  )
                                }
                              />
                              {/* 44px (size lg) — the cap steppers are a primary
                                  touch control (docs/accessibility.md §1.9). */}
                              <Group gap={6} grow>
                                <Button
                                  variant="default"
                                  size="lg"
                                  disabled={(form.values.registrationCap ?? 1) <= 1}
                                  aria-label="Decrease limit by 10"
                                  onClick={() => bumpRegistrationCap(-10)}
                                >
                                  −10
                                </Button>
                                <Button
                                  variant="default"
                                  size="lg"
                                  disabled={(form.values.registrationCap ?? 1) <= 1}
                                  aria-label="Decrease limit by 1"
                                  onClick={() => bumpRegistrationCap(-1)}
                                >
                                  −1
                                </Button>
                                <Button
                                  variant="default"
                                  size="lg"
                                  aria-label="Increase limit by 1"
                                  onClick={() => bumpRegistrationCap(1)}
                                >
                                  +1
                                </Button>
                                <Button
                                  variant="default"
                                  size="lg"
                                  aria-label="Increase limit by 10"
                                  onClick={() => bumpRegistrationCap(10)}
                                >
                                  +10
                                </Button>
                              </Group>
                            </Stack>
                          )}
                        </Stack>
                      )}
                    </WizardSection>
                  )}
                </>
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

              <EventClashCheck
                request={clashRequest}
                isAdmin={isAdmin}
                paused={hidden}
                onOpenInCalendar={onOpenInCalendar}
              />

              {isDesktopWide ? (
                <Grid gap="sm">
                  {reviewSections.map(({ key, span, node }) => (
                    <Grid.Col key={key} span={span}>
                      {node}
                    </Grid.Col>
                  ))}
                </Grid>
              ) : (
                reviewSections.map(({ key, node }) => <div key={key}>{node}</div>)
              )}

              {/* Only shown when this save actually adds participants — the
                  server notifies newly-included people only, so with nobody
                  new there is nothing here to turn off. */}
              {addedParticipantCount > 0 && (
                <WizardSection title="Notifications">
                  <Switch
                    label="Notify participants"
                    description={
                      notifyParticipants
                        ? "Sends a browser notification to people newly added to this event."
                        : "No notifications will be sent for this save."
                    }
                    checked={notifyParticipants}
                    onChange={(event) => setNotifyParticipants(event.currentTarget.checked)}
                  />
                </WizardSection>
              )}
            </Stack>
          </div>
        )}
      </div>

      {/* Bottom step strip, anchored above the action bar so it lives in the
          thumb zone next to Back/Next. The `wizardStepIndicator` feature flag
          picks the presentation: the default labelled rail names every step,
          the guided variant labels the circles on wide desktops and offers a
          step menu on smaller screens, and classic keeps the bare circles.
          Tapping any step is a free jump (see `goToStep`). At the wide tier the
          guided strip flips to a vertical rail down the left of the body
          (`orientation="vertical"`), which is what frees the height a horizontal
          strip would otherwise spend. */}
      <EventFormSteps
        steps={steps}
        step={step}
        variant={wizardStepIndicator}
        isDesktopWide={isDesktopWide}
        orientation={verticalSteps ? "vertical" : "horizontal"}
        onJump={goToStep}
      />

      {/* Offline reason (docs/ui-ux-improvements.md D7): one quiet line beside
          the disabled submit button — the standing amber OfflineBanner says
          "offline", this says what it means *here*: the draft is safe, only
          the write waits. */}
      {offline && (
        <Group className="c2-wizard-offline" gap={6} justify="center" wrap="nowrap">
          <IconCloudOff size={15} aria-hidden />
          <Text size="xs" c="dimmed">
            You&apos;re offline — minimize to keep your draft. Reconnect to submit.
          </Text>
        </Group>
      )}

      <Group
        className="c2-wizard-actions"
        justify={step === 0 ? "flex-end" : "space-between"}
        gap="sm"
      >
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
            disabled={offline}
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
