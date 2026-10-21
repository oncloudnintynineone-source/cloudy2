/**
 * Copy for the event wizard's minimized draft bar. Kept pure so the docked bar
 * and its screen-reader label stay in one place (and can be unit-tested).
 */
export type EventDraftKind = "create" | "edit" | "duplicate";

export interface EventDraftPresentation {
  /** Visible action heading, e.g. "Resume draft". */
  heading: string;
  /** Secondary line: the draft kind + event title where available. */
  detail: string;
  /** Accessible name for the resume action. */
  ariaLabel: string;
}

const RESUME_LABEL = "Resume draft";

export function eventDraftPresentation(
  kind: EventDraftKind,
  title?: string | null,
): EventDraftPresentation {
  const trimmedTitle = kind === "create" ? "" : (title?.trim() ?? "");

  let detail: string;
  let ariaContext: string;
  if (kind === "create") {
    detail = "New event";
    ariaContext = "new event";
  } else if (kind === "duplicate") {
    detail = trimmedTitle ? `Copy of ${trimmedTitle}` : "Duplicate event";
    ariaContext = trimmedTitle ? `duplicate of ${trimmedTitle}` : "duplicate event";
  } else {
    detail = trimmedTitle || "Edit event";
    ariaContext = trimmedTitle ? `edit event for ${trimmedTitle}` : "edit event";
  }

  return {
    heading: RESUME_LABEL,
    detail,
    ariaLabel: `${RESUME_LABEL} (${ariaContext})`,
  };
}
