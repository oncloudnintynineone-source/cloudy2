"use client";

import { useRouter } from "next/navigation";
import { Button, Grid, Group, NumberInput, Paper, Stack, Switch, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import {
  updateAuditLogRetention,
  updateKeyword,
  updateWebhook,
  type SettingsActionResult,
} from "@/lib/settings/actions";
import {
  AUDIT_RETENTION_MAX,
  AUDIT_RETENTION_MIN,
  validateKeywordForm,
  validateRetentionForm,
  validateWebhookForm,
  type KeywordFormValues,
  type RetentionFormValues,
  type WebhookFormValues,
} from "@/lib/settings/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

interface SettingsFormProps {
  keyword: string;
  retentionDays: number;
  webhookUrl: string;
  webhookSecret: string;
  webhookEnabled: boolean;
}

export function SettingsForm({
  keyword,
  retentionDays,
  webhookUrl,
  webhookSecret,
  webhookEnabled,
}: SettingsFormProps) {
  const router = useRouter();

  const keywordForm = useForm<KeywordFormValues>({
    initialValues: { keyword },
    validate: (values) => validateKeywordForm(values),
  });

  const retentionForm = useForm<RetentionFormValues>({
    initialValues: { retentionDays },
    validate: (values) => validateRetentionForm(values),
  });

  const webhookForm = useForm<WebhookFormValues>({
    initialValues: { webhookUrl, webhookSecret, webhookEnabled },
    validate: (values) => validateWebhookForm(values),
  });

  const onSubmitKeyword = keywordForm.onSubmit(async (values) => {
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
  });

  const onSubmitRetention = retentionForm.onSubmit(async (values) => {
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
  });

  const onSubmitWebhook = webhookForm.onSubmit(async (values) => {
    const result: SettingsActionResult = await updateWebhook(values);

    if (result.ok) {
      notifications.show({ color: "green", message: "Event webhook settings updated" });
      router.refresh();
      return;
    }

    if (result.field === "webhookUrl") {
      webhookForm.setFieldError("webhookUrl", result.error);
    } else if (result.field === "webhookSecret") {
      webhookForm.setFieldError("webhookSecret", result.error);
    }
    notifications.show({ color: "red", message: result.error });
  });

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
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Paper withBorder p="sm" style={{ height: "100%" }}>
          <form onSubmit={onSubmitWebhook}>
            <Stack>
              <Switch
                label="Event Webhook"
                description="POST a JSON notification to external systems whenever an event is created, modified, or deleted."
                {...webhookForm.getInputProps("webhookEnabled", { type: "checkbox" })}
              />
              <TextInput
                label="Webhook URL"
                description="The endpoint that receives the JSON payload. Leave empty to disable."
                placeholder="https://example.com/hooks/cloudy2"
                {...webhookForm.getInputProps("webhookUrl")}
              />
              <TextInput
                type="password"
                label="Signing Secret"
                description={
                  'Optional shared secret; deliveries carry an X-Cloudy2-Signature header (HMAC-SHA256 of "timestamp.body") receivers can verify.'
                }
                {...webhookForm.getInputProps("webhookSecret")}
              />
              <Group justify="flex-end">
                <Button
                  type="submit"
                  loading={webhookForm.submitting}
                  loaderProps={BUTTON_LOADER_PROPS}
                >
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
