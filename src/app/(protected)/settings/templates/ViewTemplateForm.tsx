"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import {
  createEventTitleTemplate,
  deleteEventTitleTemplate,
  updateEventTitleTemplateById,
} from "@/lib/settings/actions";
import { formatEventTitle, type EventTitleInput } from "@/lib/settings/formatEventTitle";
import { EVENT_TITLE_PLACEHOLDERS, getEventTitleTemplateWarnings } from "@/lib/settings/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

interface EventTitleTemplateView {
  id: string;
  label: string;
  template: string;
}

interface ViewTemplateFormProps {
  template: EventTitleTemplateView | null;
  existingLabels: string[];
  sample: EventTitleInput;
  emptySample: EventTitleInput;
  onDone: () => void;
  onDeleteDone?: () => void;
}

function insertTokenAtCursor(
  current: string,
  setValue: (value: string) => void,
  input: HTMLTextAreaElement | null,
  token: string,
) {
  if (!input) {
    setValue(current + token);
    return;
  }
  const start = input.selectionStart ?? current.length;
  const end = input.selectionEnd ?? current.length;
  setValue(current.slice(0, start) + token + current.slice(end));
  requestAnimationFrame(() => {
    input.focus();
    const pos = start + token.length;
    input.setSelectionRange(pos, pos);
  });
}

function wrapSelectionInConditional(
  current: string,
  setValue: (value: string) => void,
  input: HTMLTextAreaElement | null,
) {
  if (!input) {
    setValue(`${current}<>`);
    return;
  }
  const start = input.selectionStart ?? current.length;
  const end = input.selectionEnd ?? current.length;
  const hasSelection = start !== end;
  if (hasSelection) {
    const selected = current.slice(start, end);
    setValue(`${current.slice(0, start)}<${selected}>${current.slice(end)}`);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + 1, start + 1 + selected.length);
    });
  } else {
    setValue(`${current.slice(0, start)}<>${current.slice(end)}`);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + 1;
      input.setSelectionRange(pos, pos);
    });
  }
}

export function ViewTemplateForm({
  template,
  existingLabels,
  sample,
  emptySample,
  onDone,
}: ViewTemplateFormProps) {
  const isEdit = template !== null;
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<{ label: string; template: string }>({
    initialValues: {
      label: template?.label ?? "",
      template: template?.template ?? "",
    },
    validate: {
      label: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Label is required";
        if (/\r|\n/.test(value)) return "Label must be a single line";
        if (trimmed.length > 40) return "Label must be 40 characters or fewer";
        const lower = trimmed.toLowerCase();
        if (existingLabels.some((l) => l.toLowerCase() === lower)) return "Label must be unique";
        return null;
      },
      template: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Template is required";
        if (/\r|\n/.test(value)) return "Template must be a single line";
        if (trimmed.length > 300) return "Template must be 300 characters or fewer";
        return null;
      },
    },
    validateInputOnBlur: true,
  });

  // Keep form in sync if template prop changes (key remount covers most, but belt-and-braces)
  useEffect(() => {
    form.setValues({
      label: template?.label ?? "",
      template: template?.template ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  const warnings = getEventTitleTemplateWarnings(form.values.template);
  const preview = formatEventTitle(sample, form.values.template);
  const emptyPreview = formatEventTitle(emptySample, form.values.template);

  const onSubmit = form.onSubmit(
    async (values) => {
      const label = values.label.trim();
      const tpl = values.template.trim();
      const result = isEdit
        ? await updateEventTitleTemplateById(template!.id, label, tpl)
        : await createEventTitleTemplate(label, tpl);
      if (result.ok) {
        notifications.show({
          color: "green",
          message: isEdit ? "Template updated" : "Template created",
        });
        onDone();
        return;
      }
      if (result.field === "templateLabel") form.setFieldError("label", result.error);
      else if (result.field === "template") form.setFieldError("template", result.error);
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  const handleDelete = async () => {
    if (!template) return;
    setDeleting(true);
    const result = await deleteEventTitleTemplate(template.id);
    setDeleting(false);
    if (result.ok) {
      notifications.show({ color: "green", message: "Template deleted" });
      setDeleteConfirm(false);
      onDone();
      return;
    }
    notifications.show({ color: "red", message: result.error });
  };

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput
          label="Name"
          description="Used in dropdowns — e.g. Compact, Detailed, With location"
          placeholder="e.g. Compact"
          maxLength={40}
          {...form.getInputProps("label")}
        />

        <Textarea
          ref={templateRef}
          label="Template"
          description="Insert tokens. Use < > to hide punctuation when a field is empty."
          placeholder="{description}< - {location}>"
          autosize
          minRows={3}
          maxRows={8}
          {...form.getInputProps("template")}
        />

        {warnings.length > 0 && (
          <Alert color="yellow" variant="light" p="xs">
            {warnings.map((w) => (
              <Text key={w} size="xs">
                {w}
              </Text>
            ))}
          </Alert>
        )}

        <Group gap={6} wrap="wrap">
          <Text size="xs" c="dimmed">
            Insert:
          </Text>
          {EVENT_TITLE_PLACEHOLDERS.map((token) => (
            <Button
              key={token}
              type="button"
              size="compact-xs"
              variant="default"
              onClick={() =>
                insertTokenAtCursor(form.values.template, (v) => form.setFieldValue("template", v), templateRef.current, token)
              }
            >
              {token}
            </Button>
          ))}
          <Button
            type="button"
            size="compact-xs"
            variant="default"
            onClick={() => wrapSelectionInConditional(form.values.template, (v) => form.setFieldValue("template", v), templateRef.current)}
          >
            {"Wrap in < >"}
          </Button>
        </Group>

        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            Preview (all fields):
          </Text>
          <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
            {preview || "—"}
          </Text>
          <Text size="xs" c="dimmed">
            Empty: {emptyPreview || "—"}
          </Text>
        </Stack>

        <Group justify={isEdit ? "space-between" : "flex-end"}>
          {isEdit && !deleteConfirm && (
            <Button color="red" variant="light" size="xs" onClick={() => setDeleteConfirm(true)}>
              Delete
            </Button>
          )}
          {isEdit && deleteConfirm && (
            <Group gap="xs">
              <Text size="xs" c="red">
                Delete “{template.label}”?
              </Text>
              <Button size="xs" variant="default" onClick={() => setDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button size="xs" color="red" loading={deleting} loaderProps={BUTTON_LOADER_PROPS} onClick={handleDelete}>
                Confirm delete
              </Button>
            </Group>
          )}
          <Group gap="xs" ml={isEdit && deleteConfirm ? 0 : "auto"}>
            <Button type="submit" loaderProps={BUTTON_LOADER_PROPS} loading={form.submitting}>
              {isEdit ? "Save" : "Create"}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
