"use client";

import { useState } from "react";
import {
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle } from "@tabler/icons-react";

import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import {
  purgeCalendarCache,
  updateAuditLogRetention,
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
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";
import { useActivityRefresh } from "@/components/ActivityBar";

interface SettingsFormProps {
  keyword: string;
  retentionDays: number;
}

export function SettingsForm({ keyword, retentionDays }: SettingsFormProps) {
  const refreshAfterSave = useActivityRefresh("settings:save");
  const [purgeOpened, setPurgeOpened] = useState(false);
  const [purging, setPurging] = useState(false);

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

  const onSubmitKeyword = keywordForm.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateKeyword(values.keyword);

      if (result.ok) {
        notifications.show({ color: "green", message: "Login keyword updated" });
        refreshAfterSave();
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
        refreshAfterSave();
        return;
      }

      if (result.field === "retentionDays") {
        retentionForm.setFieldError("retentionDays", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => retentionForm.getInputNode(field)),
  );

  const handlePurge = async () => {
    if (purging) {
      return;
    }
    setPurging(true);
    try {
      const result: SettingsActionResult = await purgeCalendarCache();
      if (result.ok) {
        notifications.show({ color: "green", message: "Calendar cache purged" });
        setPurgeOpened(false);
        refreshAfterSave();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setPurging(false);
    }
  };

  return (
    <>
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
      </Grid>

      <Paper withBorder p="sm" mt="md" className={CONTENT_ENTER_CLASS} style={{ borderColor: "var(--mantine-color-red-4)" }}>
        <Stack gap={2}>
          <Group gap="xs">
            <IconAlertTriangle size={16} color="var(--mantine-color-red-6)" />
            <Text size="sm" fw={600} c="red">
              Danger Zone
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            Purge all cached Google Calendar data. Entries are re-fetched from Google on the next
            dashboard view, which may be slower while it warms back up.
          </Text>
          <Group justify="flex-end" mt={4}>
            <Button
              variant="light"
              color="red"
              size="xs"
              leftSection={<IconAlertTriangle size={14} />}
              onClick={() => setPurgeOpened(true)}
            >
              Purge Calendar Cache
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Modal
        opened={purgeOpened}
        onClose={() => setPurgeOpened(false)}
        title="Purge calendar cache"
        centered
        size="sm"
      >
        <Text size="sm">
          Permanently delete all cached Google Calendar data? It will be re-fetched from Google on
          the next dashboard view. This cannot be undone.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setPurgeOpened(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={purging}
            loaderProps={BUTTON_LOADER_PROPS}
            onClick={handlePurge}
          >
            Purge
          </Button>
        </Group>
      </Modal>
    </>
  );
}
