"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import {
  updateKeyword,
  updateNameTemplate,
  type SettingsActionResult,
} from "@/lib/settings/actions";
import { formatFullName } from "@/lib/settings/formatName";
import {
  NAME_TEMPLATE_PLACEHOLDERS,
  validateKeywordForm,
  validateNameTemplate,
  type KeywordFormValues,
  type NameTemplateFormValues,
} from "@/lib/settings/validate";

interface SettingsFormProps {
  keyword: string;
  nameTemplate: string;
  previewUsers: { name: string; departmentName: string | null }[];
}

const EXAMPLE = { name: "John Lai", departmentName: "Engineering 1" };

export function SettingsForm({ keyword, nameTemplate, previewUsers }: SettingsFormProps) {
  const router = useRouter();
  const templateInputRef = useRef<HTMLInputElement>(null);

  const keywordForm = useForm<KeywordFormValues>({
    initialValues: { keyword },
    validate: (values) => validateKeywordForm(values),
  });

  const nameTemplateForm = useForm<NameTemplateFormValues>({
    initialValues: { nameTemplate },
    validate: (values) => validateNameTemplate(values),
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

  const onSubmitNameTemplate = nameTemplateForm.onSubmit(async (values) => {
    const result: SettingsActionResult = await updateNameTemplate(values.nameTemplate);

    if (result.ok) {
      notifications.show({ color: "green", message: "Name template updated" });
      router.refresh();
      return;
    }

    if (result.field === "nameTemplate") {
      nameTemplateForm.setFieldError("nameTemplate", result.error);
    }
    notifications.show({ color: "red", message: result.error });
  });

  function insertToken(token: string) {
    const input = templateInputRef.current;
    const current = nameTemplateForm.values.nameTemplate;
    if (!input) {
      nameTemplateForm.setFieldValue("nameTemplate", current + token);
      return;
    }
    const start = input.selectionStart ?? current.length;
    const end = input.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    nameTemplateForm.setFieldValue("nameTemplate", next);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + token.length;
      input.setSelectionRange(pos, pos);
    });
  }

  const template = nameTemplateForm.values.nameTemplate;

  return (
    <Stack>
      <Paper withBorder p="sm">
        <form onSubmit={onSubmitKeyword}>
          <Stack>
            <TextInput
              label="User login keyword"
              description="Users sign in as their 8-digit phone followed by the keyword — e.g. 81234567leave."
              placeholder="leave"
              {...keywordForm.getInputProps("keyword")}
            />
            <Group justify="flex-end">
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </form>
      </Paper>

      <Paper withBorder p="sm">
        <form onSubmit={onSubmitNameTemplate}>
          <Stack>
            <Text fw={600}>Display name template</Text>
            <Text size="sm" c="dimmed">
              Compose a user&apos;s fully qualified name from their name and department. The
              result is used wherever a user&apos;s full name is shown.
            </Text>

            <TextInput
              ref={templateInputRef}
              label="Template"
              description="Insert tokens to splice in the user's name and department."
              placeholder="{name}: DEPT-{department}"
              {...nameTemplateForm.getInputProps("nameTemplate")}
            />

            <Group gap={6}>
              <Text size="xs" c="dimmed">
                Insert:
              </Text>
              {NAME_TEMPLATE_PLACEHOLDERS.map((token) => (
                <Button
                  key={token}
                  type="button"
                  size="compact-xs"
                  variant="default"
                  onClick={() => insertToken(token)}
                >
                  {token}
                </Button>
              ))}
            </Group>

            <Divider />

            <Stack gap={4}>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Preview
              </Text>
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm">{EXAMPLE.name}</Text>
                <Text size="sm" fw={600} ta="right">
                  {formatFullName(EXAMPLE, template) || "—"}
                </Text>
              </Group>
              {previewUsers.map((user) => (
                <Group key={user.name} justify="space-between" wrap="nowrap">
                  <Text size="sm" c="dimmed">
                    {user.name}
                  </Text>
                  <Text size="sm" fw={600} ta="right" c="dimmed">
                    {formatFullName(user, template) || "—"}
                  </Text>
                </Group>
              ))}
            </Stack>

            <Group justify="flex-end">
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
}