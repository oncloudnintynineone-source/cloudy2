"use client";

import { useRouter } from "next/navigation";
import { Button, Group, Paper, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { updateKeyword, type SettingsActionResult } from "@/lib/settings/actions";
import { validateKeywordForm, type KeywordFormValues } from "@/lib/settings/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

interface SettingsFormProps {
  keyword: string;
}

export function SettingsForm({ keyword }: SettingsFormProps) {
  const router = useRouter();

  const keywordForm = useForm<KeywordFormValues>({
    initialValues: { keyword },
    validate: (values) => validateKeywordForm(values),
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
    </Stack>
  );
}
