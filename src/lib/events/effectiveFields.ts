/**
 * Client-side mirror of the write path's field dropping (`resolveEventFields`,
 * `src/lib/events/writeContext.ts`): the wizard KEEPS every value the user
 * typed — switching the event type or toggling registration no longer destroys
 * a draft — and instead resolves what the save actually carries here, so the
 * preview, the review step, the notify diff and the submit payload all match
 * what the server will store. The server stays the authority; this only mirrors
 * its drop so nothing the user cannot see gets silently saved (or lost).
 */

/** One prefixed invitee tag (`user:<id>` / `dept:<id>`, `splitInvitees`). */
const USER_PREFIX = "user:";

export interface EffectiveInviteeInput {
  /** The raw prefixed invitee tags held in the form. */
  invitees: string[];
  /** The event is open for self-registration (person-only participants). */
  registrationType: boolean;
  /** The selected type shows the Participants step (registration forces it on). */
  showInviteesStep: boolean;
  /** The effective organizer, used when the type hides participants. */
  creatorId: string;
}

/**
 * The invitee tags the save carries, mirroring `resolveEventFields`:
 * registration events are person-only (department tags are not participants),
 * and a type whose Participants step is hidden stores the organizer as its
 * sole attendee (there is no step on which anyone could self-invite).
 */
export function effectiveInviteeTags(input: EffectiveInviteeInput): string[] {
  if (input.registrationType) {
    return input.invitees.filter((value) => value.startsWith(USER_PREFIX));
  }
  if (!input.showInviteesStep) {
    return input.creatorId ? [`${USER_PREFIX}${input.creatorId}`] : [];
  }
  return input.invitees;
}

export interface EffectiveFreeTextInput {
  title: string;
  /** Optional on the wire (legacy payloads); blanked to `""` when kept. */
  remarks: string | undefined;
  /** The selected type shows the Details step (Description + Remarks). */
  showRemarksStep: boolean;
}

/**
 * The free-text fields the save carries: a type with remarks disabled stores
 * neither field (the title recipe's `{description}` token renders empty), so
 * the payload blanks them while the form keeps the typed text for a switch
 * back.
 */
export function effectiveFreeText(input: EffectiveFreeTextInput): {
  title: string;
  remarks: string;
} {
  return input.showRemarksStep
    ? { title: input.title, remarks: input.remarks ?? "" }
    : { title: "", remarks: "" };
}
