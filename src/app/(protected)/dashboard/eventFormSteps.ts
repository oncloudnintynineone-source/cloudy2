import type { EventFormValues } from "@/lib/events/validate";

/** Wizard step ids for the staged event form. */
export type StepId = "type" | "time" | "location" | "invitees" | "remarks" | "settings" | "review";

export interface StepDef {
  id: StepId;
  /** Form fields that must validate cleanly before the step can be left. */
  fields: (keyof EventFormValues)[];
}

/**
 * The full wizard walk: the location, remarks and invitees steps drop out per
 * the selected type's config. A type whose location step is hidden (admin-set
 * `show_location` off, only possible with a single allowed location) has no
 * Location step at all — every event saves in that sole category. An unlocked
 * exclusively in-camp type keeps the step but collapses the category selector
 * to a single, disabled option while still offering an optional specific
 * location. Types with remarks or invitees disabled have neither step.
 * Everyone passes through the always-present "Other settings" step (Pin +
 * organizer-only edit lock + per-event registration) and ends on a read-only
 * review of everything entered so far.
 */
export function buildSteps(
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
    { id: "settings", fields: [] },
    { id: "review", fields: [] },
  ];
}

/**
 * Full display names for the step indicator, menu items and announcements.
 * They describe the *section*, not a position — the walk's length shifts when
 * the selected type hides its remarks/invitees step, so numbered labels would
 * renumber mid-flow.
 */
export const STEP_LABELS: Record<StepId, string> = {
  type: "Type",
  time: "Time",
  location: "Location",
  invitees: "Participants",
  remarks: "Remarks",
  settings: "Other settings",
  review: "Review",
};

/** Compact captions for the always-visible labelled rail. */
export const STEP_SHORT_LABELS: Record<StepId, string> = {
  type: "Type",
  time: "Time",
  location: "Location",
  invitees: "Participants",
  remarks: "Remarks",
  settings: "Settings",
  review: "Review",
};
