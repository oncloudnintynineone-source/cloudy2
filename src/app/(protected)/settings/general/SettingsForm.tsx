"use client";

import { useRouter } from "next/navigation";
import { Button, Group, NumberInput, Paper, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { updateAuditLogRetention, updateKeyword, type SettingsActionResult } from "@/lib/settings/actions";
import {
  AUDIT_RETENTION_MAX,
  AUDIT_RETENTION_MIN,
  validateKeywordForm,
  validateRetentionForm,
  type KeywordFormValues,
  type RetentionFormValues,
} from "@/lib/settings/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

interface SettingsFormProps {
  keyword: string;
  retentionDays: number;
}

export function SettingsForm({ keyword, retentionDays }: SettingsFormProps) {
  const router = useRouter();

  const keywordForm = useForm<KeywordFormValues>({
    initialValues: { keyword },
    validate: (values) => validateKeywordForm(values),
  });

  const retentionForm = useForm<RetentionFormValues>({
    initialValues: { retentionDays },
    validate: (values) => validateRetentionForm(values),
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

  return (
    <Stack>
      <Paper withBorder p="sm">
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
      <Paper withBorder p="sm">
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
    </Stack>
  );
}
