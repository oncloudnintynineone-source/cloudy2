"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { TimeInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { useActivityRefresh } from "@/components/ActivityBar";
import { PickerField, type PickerBadgeItem } from "@/components/PickerField";
import { UserSelectModal } from "@/components/UserSelectModal";
import { WEEKDAY_ABBREVIATIONS } from "@/lib/events/datetime";
import { renderTemplate } from "@/lib/email/template";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import {
  saveParadeEmailSettings,
  sendParadeStateEmailTest,
  type ParadeEmailActionResult,
} from "@/lib/parade-email/actions";
import { PARADE_EMAIL_SAMPLE_CONTEXT } from "@/lib/parade-email/report";
import {
  PARADE_EMAIL_BODY_MAX_LENGTH,
  PARADE_EMAIL_BODY_REQUIRED_TOKEN,
  PARADE_EMAIL_SUBJECT_MAX_LENGTH,
  PARADE_EMAIL_TEMPLATE_PLACEHOLDERS,
  PARADE_EMAIL_WEEKDAYS,
  validateParadeEmailForm,
  type ParadeEmailFormValues,
} from "@/lib/parade-email/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";
import { buildUserGroups, selectionByGroup, type UserGroupInput } from "@/lib/users/userSelect";

interface ParadeEmailFormProps {
  pickerUsers: UserGroupInput[];
  currentUserId: string;
  initial: ParadeEmailFormValues;
}

export function ParadeEmailForm({ pickerUsers, currentUserId, initial }: ParadeEmailFormProps) {
  const refreshAfterSave = useActivityRefresh("parade-email:save");
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);
  const [sendingTest, setSendingTest] = useState(false);

  const groups = useMemo(() => buildUserGroups(pickerUsers), [pickerUsers]);

  const form = useForm<ParadeEmailFormValues>({
    initialValues: initial,
    validate: (values) => validateParadeEmailForm(values),
    validateInputOnBlur: true,
  });

  const recipientItems: PickerBadgeItem[] = groups
    .flatMap((section) => section.options)
    .filter((option) => form.values.recipientIds.includes(option.id))
    .map((option) => ({ key: option.id, label: option.label, self: option.id === currentUserId }));

  const preview = useMemo(
    () => ({
      subject: renderTemplate(form.values.subjectTemplate, PARADE_EMAIL_SAMPLE_CONTEXT),
      body: renderTemplate(form.values.bodyTemplate, PARADE_EMAIL_SAMPLE_CONTEXT),
    }),
    [form.values.subjectTemplate, form.values.bodyTemplate],
  );

  const onSubmit = form.onSubmit(
    async (values) => {
      const result: ParadeEmailActionResult = await saveParadeEmailSettings(values);
      if (result.ok) {
        notifications.show({ color: "green", message: "Parade state email settings saved" });
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

  async function sendTest() {
    if (sendingTest) {
      return;
    }
    setSendingTest(true);
    try {
      const result = await sendParadeStateEmailTest();
      if (result.ok) {
        notifications.show({
          color: "green",
          message: "Test email sent to your address",
        });
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <Paper withBorder p="sm" className={CONTENT_ENTER_CLASS} maw={720}>
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          <Switch
            label="Send parade-state email"
            description="On each selected day, the first time anyone uses the app at or after the send time, the selected recipients receive a snapshot of the parade state. Users without an email address on their profile are skipped."
            {...form.getInputProps("enabled", { type: "checkbox" })}
          />

          <Stack gap={4}>
            <PickerField
              label="Recipients"
              count={form.values.recipientIds.length}
              triggerLabel="Choose"
              items={recipientItems}
              empty={
                <Text c="dimmed" fz="sm">
                  No recipients selected.
                </Text>
              }
              onOpen={openPicker}
            />
            {form.errors.recipientIds && (
              <Text c="red" fz="sm">
                {form.errors.recipientIds}
              </Text>
            )}
          </Stack>

          <TimeInput
            label="Send time (Singapore time)"
            description="The email goes out on the first app activity at or after this time."
            {...form.getInputProps("sendTime")}
          />

          <Checkbox.Group
            label="Send days"
            description="Public holidays are not excluded."
            value={form.values.days.map(String)}
            onChange={(values) => form.setFieldValue("days", values.map(Number))}
            error={form.errors.days}
          >
            <Group gap="md" mt={6}>
              {PARADE_EMAIL_WEEKDAYS.map((day, index) => (
                <Checkbox key={day} value={String(day)} label={WEEKDAY_ABBREVIATIONS[index]} />
              ))}
            </Group>
          </Checkbox.Group>

          <TextInput
            label="Subject template"
            description={`Tokens: ${PARADE_EMAIL_TEMPLATE_PLACEHOLDERS.join(" ")}`}
            maxLength={PARADE_EMAIL_SUBJECT_MAX_LENGTH}
            {...form.getInputProps("subjectTemplate")}
          />

          <Textarea
            label="Body template"
            description={`${PARADE_EMAIL_BODY_REQUIRED_TOKEN} renders the per-department roster and is required.`}
            autosize
            minRows={8}
            maxRows={20}
            maxLength={PARADE_EMAIL_BODY_MAX_LENGTH}
            styles={{
              input: {
                fontFamily: "var(--mantine-font-family-monospace)",
                fontSize: "var(--mantine-font-size-sm)",
              },
            }}
            {...form.getInputProps("bodyTemplate")}
          />

          <Paper withBorder p="sm" variant="filled">
            <Text fz="xs" fw={700} c="dimmed" mb={4}>
              Preview (sample data)
            </Text>
            <Box style={{ whiteSpace: "pre-wrap" }}>
              <Text fz="sm" fw={600}>
                {preview.subject}
              </Text>
              <Text fz="sm" mt={4}>
                {preview.body}
              </Text>
            </Box>
          </Paper>

          <Group justify="space-between">
            <Button
              type="button"
              variant="light"
              onClick={sendTest}
              loading={sendingTest}
              loaderProps={BUTTON_LOADER_PROPS}
            >
              Send test to my email
            </Button>
            <Button type="submit" loading={form.submitting} loaderProps={BUTTON_LOADER_PROPS}>
              Save
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Test sends a [TEST] copy to your own address only — not to the configured recipients.
          </Text>
        </Stack>
      </form>

      {/* Rendered only while open so the draft re-seeds from the current
          selection every time (the UserSelectModal pattern). */}
      {pickerOpened && (
        <UserSelectModal
          opened
          onClose={closePicker}
          title="Select recipients"
          confirmLabel="Add recipients"
          groups={groups}
          values={selectionByGroup(groups, form.values.recipientIds)}
          onConfirm={(selection) => {
            form.setFieldValue("recipientIds", Object.values(selection).flat());
          }}
        />
      )}
    </Paper>
  );
}
