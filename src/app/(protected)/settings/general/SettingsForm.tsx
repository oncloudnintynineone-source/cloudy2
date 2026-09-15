"use client";

import { useState } from "react";
import { Button, Group, NumberInput, Paper, Stack, Text } from "@mantine/core";
import { ResponsiveSheet } from "@/components/ResponsiveSheet";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle } from "@tabler/icons-react";

import { useActivityRefresh } from "@/components/ActivityBar";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import {
  purgeCalendarCache,
  updateAuditLogRetention,
  type SettingsActionResult,
} from "@/lib/settings/actions";
import {
  AUDIT_RETENTION_MAX,
  AUDIT_RETENTION_MIN,
  validateRetentionForm,
  type RetentionFormValues,
} from "@/lib/settings/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

interface SettingsFormProps {
  retentionDays: number;
}

export function SettingsForm({ retentionDays }: SettingsFormProps) {
  const refreshAfterSave = useActivityRefresh("settings:save");
  const [purgeOpened, setPurgeOpened] = useState(false);
  const [purging, setPurging] = useState(false);

  const retentionForm = useForm<RetentionFormValues>({
    initialValues: { retentionDays },
    validate: (values) => validateRetentionForm(values),
    validateInputOnBlur: true,
  });

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
      <Paper withBorder p="sm" className={CONTENT_ENTER_CLASS}>
        <form onSubmit={onSubmitRetention}>
          <Stack>
            <NumberInput
              label="Audit log retention"
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

      <Paper
        withBorder
        p="sm"
        mt="md"
        className={CONTENT_ENTER_CLASS}
        style={{ borderColor: "var(--mantine-color-red-4)" }}
      >
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

      <ResponsiveSheet
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
      </ResponsiveSheet>
    </>
  );
}
