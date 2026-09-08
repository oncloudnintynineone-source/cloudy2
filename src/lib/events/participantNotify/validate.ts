/**
 * Pure validation/normalization helpers for the participant-notification
 * content templates (Settings → Templates). Kept free of I/O so they can be
 * unit-tested without a database.
 */

import type { ParticipantNotifyTemplates } from "./templates";

export const PARTICIPANT_NOTIFY_TITLE_TEMPLATE_MAX_LENGTH = 140;
export const PARTICIPANT_NOTIFY_BODY_TEMPLATE_MAX_LENGTH = 300;

export interface ParticipantNotifyTemplatesFormErrors {
  createdTitle?: string;
  createdBody?: string;
  addedTitle?: string;
  addedBody?: string;
  [key: string]: string | undefined;
}

function validateField(
  errors: ParticipantNotifyTemplatesFormErrors,
  key: keyof ParticipantNotifyTemplates,
  value: string,
  maxLength: number,
): void {
  const template = value.trim();
  if (!template) {
    errors[key] = "Template is required";
  } else if (/\r|\n/.test(value)) {
    errors[key] = "Template must be a single line";
  } else if (template.length > maxLength) {
    errors[key] = `Template must be ${maxLength} characters or fewer`;
  }
}

/**
 * Validate the four notification templates. Each is required, single-line and
 * length-capped — the OS notification headline/body collapse to one line, so a
 * multi-line body would not render as written.
 */
export function validateParticipantNotifyTemplates(
  values: ParticipantNotifyTemplates,
): ParticipantNotifyTemplatesFormErrors {
  const errors: ParticipantNotifyTemplatesFormErrors = {};
  validateField(errors, "createdTitle", values.createdTitle, PARTICIPANT_NOTIFY_TITLE_TEMPLATE_MAX_LENGTH);
  validateField(errors, "createdBody", values.createdBody, PARTICIPANT_NOTIFY_BODY_TEMPLATE_MAX_LENGTH);
  validateField(errors, "addedTitle", values.addedTitle, PARTICIPANT_NOTIFY_TITLE_TEMPLATE_MAX_LENGTH);
  validateField(errors, "addedBody", values.addedBody, PARTICIPANT_NOTIFY_BODY_TEMPLATE_MAX_LENGTH);
  return errors;
}
