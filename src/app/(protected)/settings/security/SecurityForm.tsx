"use client";

import { Button, Group, Paper, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { useActivityRefresh } from "@/components/ActivityBar";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { updateKeyword, type SettingsActionResult } from "@/lib/settings/actions";
import { validateKeywordForm, type KeywordFormValues } from "@/lib/settings/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

interface SecurityFormProps {
  keyword: string;
}

export function SecurityForm({ keyword }: SecurityFormProps) {
  const refreshAfterSave = useActivityRefresh("settings:save");

  const keywordForm = useForm<KeywordFormValues>({
    initialValues: { keyword },
    validate: (values) => validateKeywordForm(values),
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

  return (
    <Paper withBorder p="sm" className={CONTENT_ENTER_CLASS}>
      <form onSubmit={onSubmitKeyword}>
        <Stack>
          <TextInput
            label="User login keyword"
            description="Regular users sign in as their 8-digit phone followed by the keyword — e.g. 81234567leave. Admins use the admin sign-in instead."
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
  );
}
