/**
 * The shared submit branch of an admin CRUD form: pick create/update by mode,
 * toast the entity-specific success copy (yellow when the action reports
 * warnings), map a returned field error back onto the matching form input, and
 * hand the success arm to the caller (the event-type migration hint, a
 * department's optimistic row patch).
 *
 * The control flow is extracted; the form values, validation and fields stay in
 * each caller. `notify` is injectable so the branch is unit-tested.
 */

import { notifications } from "@mantine/notifications";
import type { UseFormReturnType } from "@mantine/form";

import type { ActionOk, ActionResult } from "@/lib/actions/result";

export type CrudNotification = { color: string; message: string; title?: string };

export interface SubmitCrudFormOptions<
  TValues extends object,
  F extends string,
  TExtra extends object = Record<never, never>,
> {
  form: UseFormReturnType<TValues>;
  isEdit: boolean;
  create: (values: TValues) => Promise<ActionResult<TExtra, F>>;
  update: (values: TValues) => Promise<ActionResult<TExtra, F>>;
  /** Success toast copy per mode. */
  success: { create: string; update: string };
  /** Action field name → form field name; identity when omitted. */
  fieldMap?: Partial<Record<F, keyof TValues>>;
  /** Success side-channel (migration hint, optimistic patch, close). */
  onSuccess?: (result: ActionOk<TExtra>, values: TValues) => void;
  /** Read `warnings` from the success arm and toast them in yellow. */
  warnings?: boolean;
  notify?: (notification: CrudNotification) => void;
}

export function submitCrudForm<
  TValues extends object,
  F extends string,
  TExtra extends object = Record<never, never>,
>(
  options: SubmitCrudFormOptions<TValues, F, TExtra>,
): (values: TValues) => Promise<void> {
  const notify = options.notify ?? ((notification) => notifications.show(notification));

  return async (values) => {
    const result = options.isEdit ? await options.update(values) : await options.create(values);

    if (result.ok) {
      const message = options.isEdit ? options.success.update : options.success.create;
      const warnings = options.warnings
        ? (result as { warnings?: string[] }).warnings
        : undefined;
      if (warnings && warnings.length > 0) {
        notify({ color: "yellow", title: message, message: warnings.join(" · ") });
      } else {
        notify({ color: "green", message });
      }
      options.onSuccess?.(result, values);
      return;
    }

    const formField = result.field
      ? (options.fieldMap?.[result.field] ?? result.field)
      : undefined;
    if (formField !== undefined) {
      type FormField = Parameters<UseFormReturnType<TValues>["setFieldError"]>[0];
      options.form.setFieldError(formField as FormField, result.error);
    }
    notify({ color: "red", message: result.error });
  };
}
