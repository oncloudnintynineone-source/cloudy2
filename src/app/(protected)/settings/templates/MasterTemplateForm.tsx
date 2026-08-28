"use client";

import { useRef } from "react";
import { Alert, Button, Group, Stack, Text, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { updateEventTitleTemplate, type SettingsActionResult } from "@/lib/settings/actions";
import { formatEventTitle, type EventTitleInput } from "@/lib/settings/formatEventTitle";
import {
  EVENT_TITLE_PLACEHOLDERS,
  getEventTitleTemplateWarnings,
  validateEventTitleTemplate,
  type EventTitleTemplateFormValues,
} from "@/lib/settings/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

interface MasterTemplateFormProps {
  initialTemplate: string;
  sample: EventTitleInput;
  emptySample: EventTitleInput;
  onDone: () => void;
}

const PEOPLE_STYLE_HINT =
  "{people} = fully qualified · {people:full} = name · {people:acronym} = shortname";

const TYPE_STYLE_HINT = "{type} = name · {type:acronym} = shortname";

const CONDITIONAL_HINT =
  "Wrap punctuation with a field in < > to hide it when empty — e.g. {description}< - {location}>< ({people:acronym})>. Escape literal < > with \\< \\>.";

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

export function MasterTemplateForm({
  initialTemplate,
  sample,
  emptySample,
  onDone,
}: MasterTemplateFormProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const form = useForm<EventTitleTemplateFormValues>({
    initialValues: { eventTitleTemplate: initialTemplate },
    validate: (values) => validateEventTitleTemplate(values),
    validateInputOnBlur: true,
  });

  const value = form.values.eventTitleTemplate;
  const warnings = getEventTitleTemplateWarnings(value);
  const preview = formatEventTitle(sample, value);
  const emptyPreview = formatEventTitle(emptySample, value);

  const onSubmit = form.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateEventTitleTemplate(values.eventTitleTemplate);
      if (result.ok) {
        notifications.show({ color: "green", message: "Master template updated" });
        onDone();
        return;
      }
      if (result.field === "eventTitleTemplate") {
        form.setFieldError("eventTitleTemplate", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <Textarea
          ref={ref}
          label="Template"
          description="Insert tokens to build the event title. Use < > to hide punctuation when a field is empty."
          placeholder={"{type:acronym}: {description}\n< ({people:acronym})>\n< - {location}>\n<, {departments}>"}
          autosize
          minRows={3}
          maxRows={8}
          {...form.getInputProps("eventTitleTemplate")}
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
              onClick={() => insertTokenAtCursor(value, (v) => form.setFieldValue("eventTitleTemplate", v), ref.current, token)}
            >
              {token}
            </Button>
          ))}
          <Button
            type="button"
            size="compact-xs"
            variant="default"
            onClick={() => wrapSelectionInConditional(value, (v) => form.setFieldValue("eventTitleTemplate", v), ref.current)}
          >
            {"Wrap in < >"}
          </Button>
        </Group>

        <Text size="xs" c="dimmed">
          {TYPE_STYLE_HINT}
        </Text>
        <Text size="xs" c="dimmed">
          {PEOPLE_STYLE_HINT}
        </Text>
        <Text size="xs" c="dimmed">
          {CONDITIONAL_HINT}
        </Text>

        <Stack gap={4}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Preview
          </Text>
          <Text size="xs" c="dimmed">
            {sample.description}
            {sample.eventType ? ` · ${sample.eventType.name}` : ""} · {sample.people.map((p) => p.acronym).join(", ") || "no invitees"} ·{" "}
            {sample.departments.join(", ") || "no departments"} · {sample.location}
          </Text>
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              All fields:
            </Text>
            <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
              {preview || "—"}
            </Text>
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              When optional fields empty:
            </Text>
            <Text size="sm" fw={600} c="dimmed" style={{ overflowWrap: "anywhere" }}>
              {emptyPreview || "—"}
            </Text>
          </Stack>
        </Stack>

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={form.submitting} loaderProps={BUTTON_LOADER_PROPS}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
