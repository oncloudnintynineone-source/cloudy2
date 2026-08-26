"use client";

import { notifications } from "@mantine/notifications";
import type { ReactNode } from "react";

/**
 * Client-side form validation failure feedback, shared by all Mantine forms.
 *
 * On a failed submit the only built-in feedback is the small red text under
 * each invalid input — easily missed when the submit button sits at the
 * bottom of a scrollable modal (the invalid fields can be above the fold).
 * So a failure also raises a toast and scrolls the first invalid field into
 * view. The toast wording matches the server-side failure message in
 * `src/lib/roster/actions.ts` ("Check the highlighted fields").
 */

/** First field (in record order) carrying a non-empty error, or null. */
export function firstErrorField(errors: Record<string, ReactNode>): string | null {
  const field = Object.keys(errors).find((key) => errors[key]);
  return field ?? null;
}

export function showValidationFailure(
  errors: Record<string, ReactNode>,
  getErrorNode?: (field: string) => HTMLElement | null,
): void {
  const field = firstErrorField(errors);
  if (!field) {
    return;
  }
  getErrorNode?.(field)?.scrollIntoView({ behavior: "smooth", block: "center" });
  notifications.show({ color: "red", message: "Check the highlighted fields" });
}
