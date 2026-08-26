"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Grid,
  Group,
  NumberInput,
  Paper,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import {
  updateAuditLogRetention,
  updateKahNotifications,
  updateKeyword,
  type SettingsActionResult,
} from "@/lib/settings/actions";
import {
  AUDIT_RETENTION_MAX,
  AUDIT_RETENTION_MIN,
  validateKeywordForm,
  validateRetentionForm,
  type KeywordFormValues,
  type RetentionFormValues,
} from "@/lib/settings/validate";
import { renderKahEmailTemplate, KAH_TEMPLATE_SAMPLE_CONTEXT } from "@/lib/kah/email";
import {
  KAH_EMAIL_BODY_TEMPLATE_DEFAULT,
  KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
} from "@/lib/kah/emailDefaults";
import {
  KAH_EMAIL_TEMPLATE_PLACEHOLDERS,
  validateKahNotificationsForm,
  type KahNotificationsFormValues,
} from "@/lib/kah/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

interface SettingsFormProps {
  keyword: string;
  retentionDays: number;
  kahEmails: string[];
  kahEmailSubject: string;
  kahEmailBody: string;
}

export function SettingsForm({
  keyword,
  retentionDays,
  kahEmails,
  kahEmailSubject,
  kahEmailBody,
}: SettingsFormProps) {
  const router = useRouter();

  const keywordForm = useForm<KeywordFormValues>({
    initialValues: { keyword },
    validate: (values) => validateKeywordForm(values),
    validateInputOnBlur: true,
  });

  const retentionForm = useForm<RetentionFormValues>({
    initialValues: { retentionDays },
    validate: (values) => validateRetentionForm(values),
    validateInputOnBlur: true,
  });

  const kahForm = useForm<KahNotificationsFormValues>({
    initialValues: {
      emails: kahEmails,
      subjectTemplate: kahEmailSubject || KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
      bodyTemplate: kahEmailBody || KAH_EMAIL_BODY_TEMPLATE_DEFAULT,
    },
    validate: (values) => validateKahNotificationsForm(values),
    validateInputOnBlur: true,
  });

  // Live preview through the exact renderer the notify path uses.
  const preview = useMemo(
    () => ({
      subject: renderKahEmailTemplate(kahForm.values.subjectTemplate, KAH_TEMPLATE_SAMPLE_CONTEXT),
      body: renderKahEmailTemplate(kahForm.values.bodyTemplate, KAH_TEMPLATE_SAMPLE_CONTEXT),
    }),
    [kahForm.values.subjectTemplate, kahForm.values.bodyTemplate],
  );

  const onSubmitKeyword = keywordForm.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateKeyword(values.keyword);

      if (result.ok) {
        notifications.show({ color: "green", message: "Login keyword updated" });
        router.refresh();
        return;
      }

      if (result.field === "keyword") {
        keywordForm.setFieldError("keyword", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => keywordForm.getInputNode(field)),
  );

  const onSubmitRetention = retentionForm.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateAuditLogRetention(values.retentionDays);

      if (result.ok) {
        notifications.show({ color: "green", message: "Audit log retention updated" });
        router.refresh();
        return;
      }

      if (result.field === "retentionDays") {
        retentionForm.setFieldError("retentionDays", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => retentionForm.getInputNode(field)),
  );

  const onSubmitKah = kahForm.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateKahNotifications(values);

      if (result.ok) {
        notifications.show({ color: "green", message: "KAH breach notifications updated" });
        router.refresh();
        return;
      }

      if (result.field === "kahEmails") {
        kahForm.setFieldError("emails", result.error);
      } else if (result.field === "kahSubject") {
        kahForm.setFieldError("subjectTemplate", result.error);
      } else if (result.field === "kahBody") {
        kahForm.setFieldError("bodyTemplate", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => kahForm.getInputNode(field)),
  );

  return (
    <Grid className={CONTENT_ENTER_CLASS} gap="md">
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Paper withBorder p="sm" style={{ height: "100%" }}>
          <form onSubmit={onSubmitKeyword}>
            <Stack>
              <TextInput
                label="User Login Keyword"
                description="Users sign in as their 8-digit phone followed by the keyword — e.g. 81234567leave."
                placeholder="leave"
                {...keywordForm.getInputProps("keyword")}
              />
              <Group justify="flex-end">
                <Button
                  type="submit"
                  loading={keywordForm.submitting}
                  loaderProps={BUTTON_LOADER_PROPS}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Paper withBorder p="sm" style={{ height: "100%" }}>
          <form onSubmit={onSubmitRetention}>
            <Stack>
              <NumberInput
                label="Audit Log Retention"
                description="How many days of audit log entries to keep. Older entries are purged automatically when the log is viewed."
                min={AUDIT_RETENTION_MIN}
                max={AUDIT_RETENTION_MAX}
                allowNegative={false}
                {...retentionForm.getInputProps("retentionDays")}
              />
              <Group justify="flex-end">
                <Button
                  type="submit"
                  loading={retentionForm.submitting}
                  loaderProps={BUTTON_LOADER_PROPS}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Grid.Col>
      <Grid.Col span={12}>
        <Paper withBorder p="sm">
          <form onSubmit={onSubmitKah}>
            <Stack gap="sm">
              <TagsInput
                label="KAH Breach Notification Emails"
                description="Addresses emailed when saving an event pushes a KAH group below its required in-country percentage (manage the groups under Settings → KAH Groups)."
                placeholder="ops@unit.gov"
                clearable
                {...kahForm.getInputProps("emails")}
              />

              <TextInput
                label="Breach Email Subject Template"
                description={`Tokens: ${KAH_EMAIL_TEMPLATE_PLACEHOLDERS.join(" ")}`}
                {...kahForm.getInputProps("subjectTemplate")}
              />

              <Textarea
                label="Breach Email Body Template"
                description="{breaches} renders the per-group summary lines and is required."
                autosize
                minRows={8}
                maxRows={16}
                styles={{
                  input: {
                    fontFamily: "var(--mantine-font-family-monospace)",
                    fontSize: "var(--mantine-font-size-sm)",
                  },
                }}
                {...kahForm.getInputProps("bodyTemplate")}
              />

              <Paper withBorder p="sm" bg="var(--mantine-color-gray-0)">
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

              <Group justify="flex-end">
                <Button type="submit" loading={kahForm.submitting} loaderProps={BUTTON_LOADER_PROPS}>
                  Save
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Grid.Col>
    </Grid>
  );
}
