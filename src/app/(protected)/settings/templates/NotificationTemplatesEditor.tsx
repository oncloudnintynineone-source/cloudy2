"use client";

import { useEffect, useRef, type ChangeEvent, type ReactNode, type RefObject } from "react";
import { Button, Divider, Group, Paper, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { useActivityRefresh } from "@/components/ActivityBar";
import {
  buildParticipantNotification,
  type ParticipantNotifyReason,
} from "@/lib/events/participantNotify/message";
import {
  PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT,
  PARTICIPANT_NOTIFY_TEMPLATE_PLACEHOLDERS,
  type ParticipantNotifyTemplates,
} from "@/lib/events/participantNotify/templates";
import { validateParticipantNotifyTemplates } from "@/lib/events/participantNotify/validate";
import { updateParticipantNotificationTemplates, type SettingsActionResult } from "@/lib/settings/actions";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

interface NotificationTemplatesEditorProps {
  initial: ParticipantNotifyTemplates;
}

type ParticipantNotifyField = keyof ParticipantNotifyTemplates;
type TitleField = "createdTitle" | "addedTitle";
type BodyField = "createdBody" | "addedBody";

/** A deterministic sample event used for the live previews. */
interface PreviewSample {
  title: string;
  eventType: string;
  time: string;
  location: string | null;
  /** Human summary of what the tokens resolve to, for the preview label. */
  caption: string;
}

const FULL_SAMPLE: PreviewSample = {
  title: "Company drill",
  eventType: "Training",
  time: "2026-08-21 14:00 – 15:30",
  location: "Parade Square",
  caption: "title: Company drill · type: Training · time: 2026-08-21 14:00 – 15:30 · location: Parade Square",
};

const MIN_SAMPLE: PreviewSample = {
  title: "",
  eventType: "",
  time: "",
  location: null,
  caption: "Untitled event with no type, time or location (shows the built-in fallbacks)",
};

/** The pieces of a Mantine `getInputProps` binding this form spreads onto inputs. */
interface FieldBinding {
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  error?: ReactNode;
}

function insertTokenAtCursor(
  current: string,
  onReplace: (value: string) => void,
  input: HTMLTextAreaElement | null,
  token: string,
) {
  if (!input) {
    onReplace(current + token);
    return;
  }
  const start = input.selectionStart ?? current.length;
  const end = input.selectionEnd ?? current.length;
  const next = current.slice(0, start) + token + current.slice(end);
  onReplace(next);
  requestAnimationFrame(() => {
    input.focus();
    const pos = start + token.length;
    input.setSelectionRange(pos, pos);
  });
}

function wrapSelectionInConditional(
  current: string,
  onReplace: (value: string) => void,
  input: HTMLTextAreaElement | null,
) {
  if (!input) {
    onReplace(`${current}<>`);
    return;
  }
  const start = input.selectionStart ?? current.length;
  const end = input.selectionEnd ?? current.length;
  const hasSelection = start !== end;
  if (hasSelection) {
    const selected = current.slice(start, end);
    onReplace(`${current.slice(0, start)}<${selected}>${current.slice(end)}`);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + 1, start + 1 + selected.length);
    });
  } else {
    onReplace(`${current.slice(0, start)}<>${current.slice(end)}`);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + 1;
      input.setSelectionRange(pos, pos);
    });
  }
}

function PreviewBlock({
  reason,
  sample,
  templates,
}: {
  reason: ParticipantNotifyReason;
  sample: PreviewSample;
  templates: ParticipantNotifyTemplates;
}) {
  const preview = buildParticipantNotification({
    reason,
    title: sample.title,
    eventType: sample.eventType,
    time: sample.time,
    location: sample.location,
    templates,
  });
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {sample.caption}
      </Text>
      <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
        {preview.title || "—"}
      </Text>
      <Text size="sm" c="dimmed" style={{ overflowWrap: "anywhere" }}>
        {preview.body || "—"}
      </Text>
    </Stack>
  );
}

function ReasonSection({
  reason,
  heading,
  description,
  titleField,
  bodyField,
  bodyRef,
  titleBinding,
  bodyBinding,
  onReplace,
  onReset,
  previewTemplates,
}: {
  reason: ParticipantNotifyReason;
  heading: string;
  description: string;
  titleField: TitleField;
  bodyField: BodyField;
  bodyRef: RefObject<HTMLTextAreaElement | null>;
  titleBinding: FieldBinding;
  bodyBinding: FieldBinding;
  onReplace: (field: ParticipantNotifyField, value: string) => void;
  onReset: () => void;
  previewTemplates: ParticipantNotifyTemplates;
}) {
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text fw={600}>{heading}</Text>
        <Button type="button" size="compact-xs" variant="subtle" onClick={onReset}>
          Reset to default
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        {description}
      </Text>

      <TextInput
        label="Title template"
        description="The notification headline."
        placeholder="{title}"
        {...titleBinding}
      />

      <Textarea
        ref={bodyRef}
        label="Body template"
        description="Wrap punctuation that depends on a field in < > to hide it when empty — e.g. {title}< · {location}>."
        placeholder={"You're invited: {title}< · {time}>< · {location}>"}
        autosize
        minRows={2}
        maxRows={5}
        styles={{
          input: {
            fontFamily: "var(--mantine-font-family-monospace)",
            fontSize: "var(--mantine-font-size-sm)",
          },
        }}
        {...bodyBinding}
      />

      <Group gap={6} wrap="wrap">
        <Text size="xs" c="dimmed">
          Insert into title:
        </Text>
        {PARTICIPANT_NOTIFY_TEMPLATE_PLACEHOLDERS.map((token) => (
          <Button
            key={token}
            type="button"
            size="compact-xs"
            variant="default"
            onClick={() =>
              insertTokenAtCursor(titleBinding.value, (v) => onReplace(titleField, v), null, token)
            }
          >
            {token}
          </Button>
        ))}
      </Group>

      <Group gap={6} wrap="wrap">
        <Text size="xs" c="dimmed">
          Insert into body:
        </Text>
        {PARTICIPANT_NOTIFY_TEMPLATE_PLACEHOLDERS.map((token) => (
          <Button
            key={token}
            type="button"
            size="compact-xs"
            variant="default"
            onClick={() =>
              insertTokenAtCursor(
                bodyBinding.value,
                (v) => onReplace(bodyField, v),
                bodyRef.current,
                token,
              )
            }
          >
            {token}
          </Button>
        ))}
        <Button
          type="button"
          size="compact-xs"
          variant="default"
          onClick={() =>
            wrapSelectionInConditional(
              bodyBinding.value,
              (v) => onReplace(bodyField, v),
              bodyRef.current,
            )
          }
        >
          {"Wrap in < >"}
        </Button>
      </Group>

      <Stack gap="sm">
        <Paper withBorder p="sm" variant="filled">
          <Text fz="xs" fw={700} c="dimmed" mb={4}>
            Preview — event with all details
          </Text>
          <PreviewBlock reason={reason} sample={FULL_SAMPLE} templates={previewTemplates} />
        </Paper>
        <Paper withBorder p="sm" variant="filled">
          <Text fz="xs" fw={700} c="dimmed" mb={4}>
            Preview — minimal event
          </Text>
          <PreviewBlock reason={reason} sample={MIN_SAMPLE} templates={previewTemplates} />
        </Paper>
      </Stack>
    </Stack>
  );
}

export function NotificationTemplatesEditor({ initial }: NotificationTemplatesEditorProps) {
  const refreshAfterSave = useActivityRefresh("templates:notification:save");
  const createdBodyRef = useRef<HTMLTextAreaElement>(null);
  const addedBodyRef = useRef<HTMLTextAreaElement>(null);

  const form = useForm<ParticipantNotifyTemplates>({
    initialValues: initial,
    validate: (values) => validateParticipantNotifyTemplates(values),
    validateInputOnBlur: true,
  });

  // Keep the form in sync with the server value after a save-driven refresh.
  useEffect(() => {
    form.setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = form.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateParticipantNotificationTemplates(values);
      if (result.ok) {
        notifications.show({ color: "green", message: "Notification templates updated" });
        refreshAfterSave();
        return;
      }
      if (result.field) {
        form.setFieldError(result.field, result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  const replace = (field: ParticipantNotifyField, value: string) =>
    form.setFieldValue(field, value);

  const createdTitleBinding = form.getInputProps("createdTitle") as unknown as FieldBinding;
  const createdBodyBinding = form.getInputProps("createdBody") as unknown as FieldBinding;
  const addedTitleBinding = form.getInputProps("addedTitle") as unknown as FieldBinding;
  const addedBodyBinding = form.getInputProps("addedBody") as unknown as FieldBinding;

  return (
    <Paper withBorder p="sm">
      <form onSubmit={onSubmit}>
        <Stack gap="lg">
          <Stack gap={2}>
            <Text fw={600}>Event Notification Templates</Text>
            <Text size="sm" c="dimmed">
              The browser push message shown to users newly included as participants — a new
              event, or an edit that adds them to an existing one. Tokens:{" "}
              {PARTICIPANT_NOTIFY_TEMPLATE_PLACEHOLDERS.join(" ")}. Empty token values drop their
              &lt; ... &gt; group. Changes apply to the next notification sent.
            </Text>
          </Stack>

          <ReasonSection
            reason="created"
            heading="When a new event is created"
            description="Shown to everyone included in a brand-new event."
            titleField="createdTitle"
            bodyField="createdBody"
            bodyRef={createdBodyRef}
            titleBinding={createdTitleBinding}
            bodyBinding={createdBodyBinding}
            onReplace={replace}
            previewTemplates={form.values}
            onReset={() => {
              form.setValues({
                ...form.values,
                createdTitle: PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT.createdTitle,
                createdBody: PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT.createdBody,
              });
            }}
          />

          <Divider />

          <ReasonSection
            reason="added"
            heading="When a user is added to an existing event"
            description="Shown when an edit newly tags a user or department."
            titleField="addedTitle"
            bodyField="addedBody"
            bodyRef={addedBodyRef}
            titleBinding={addedTitleBinding}
            bodyBinding={addedBodyBinding}
            onReplace={replace}
            previewTemplates={form.values}
            onReset={() => {
              form.setValues({
                ...form.values,
                addedTitle: PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT.addedTitle,
                addedBody: PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT.addedBody,
              });
            }}
          />

          <Group justify="flex-end">
            <Button type="submit" loading={form.submitting} loaderProps={BUTTON_LOADER_PROPS}>
              Save templates
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}
