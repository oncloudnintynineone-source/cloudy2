"use client";

import { useState } from "react";
import { Switch, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { ColorSwatchPicker } from "@/components/ColorSwatchPicker";
import { QuickLinkIconPicker } from "@/components/QuickLinkIconPicker";
import {
  createQuickLink,
  deleteQuickLink,
  updateQuickLink,
  type QuickLinkActionResult,
} from "@/lib/quickLinks/actions";
import { DEFAULT_QUICK_LINK_ICON } from "@/lib/quickLinks/icons";
import { validateQuickLinkForm, type QuickLinkFormValues } from "@/lib/quickLinks/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

interface QuickLinkFormProps {
  link: {
    id: string;
    label: string;
    url: string;
    icon: string;
    color: string | null;
    enabled: boolean;
  } | null;
  onDone: () => void;
}

export function QuickLinkForm({ link, onDone }: QuickLinkFormProps) {
  const isEdit = link !== null;
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<QuickLinkFormValues>({
    initialValues: {
      label: link?.label ?? "",
      url: link?.url ?? "",
      icon: link?.icon ?? DEFAULT_QUICK_LINK_ICON,
      color: link?.color ?? "",
      enabled: link?.enabled ?? true,
    },
    validate: (values) => validateQuickLinkForm(values),
    validateInputOnBlur: true,
  });

  const onSubmit = form.onSubmit(
    async (values) => {
      const result: QuickLinkActionResult = isEdit
        ? await updateQuickLink(link.id, values)
        : await createQuickLink(values);

      if (result.ok) {
        notifications.show({
          color: "green",
          message: isEdit ? "Quick link updated" : "Quick link created",
        });
        onDone();
        return;
      }

      if (result.field === "label") {
        form.setFieldError("label", result.error);
      } else if (result.field === "url") {
        form.setFieldError("url", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  async function confirmDelete() {
    if (!link || deleting) {
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteQuickLink(link.id);
      closeConfirm();
      if (result.ok) {
        notifications.show({ color: "green", message: "Quick link deleted" });
        onDone();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput
          label="Label"
          required
          placeholder="Leave request"
          description="Shown as the menu item on the Calendar page"
          {...form.getInputProps("label")}
        />
        <TextInput
          label="URL"
          required
          placeholder="https://apps.example.com/leave"
          description="Opened in a new tab from the quick-links menu"
          {...form.getInputProps("url")}
        />

        {/* Icon buttons (not an input), same no-keyboard rationale as the color
            swatches: tapping never raises the mobile keyboard. */}
        <Stack gap={4}>
          <Text fw={500} size="sm">
            Icon
          </Text>
          <QuickLinkIconPicker
            value={form.values.icon}
            onChange={(icon) => form.setFieldValue("icon", icon)}
          />
        </Stack>

        <Stack gap={4}>
          <Text fw={500} size="sm">
            Icon color
          </Text>
          <ColorSwatchPicker
            value={form.values.color}
            onChange={(color) => form.setFieldValue("color", color)}
            autoRefId={null}
          />
          <Text size="sm" c="dimmed">
            Tints this link&apos;s icon in the menu. Auto leaves it uncolored.
          </Text>
        </Stack>

        <Switch
          label="Enabled"
          description="Disabled links are hidden from the menu; their configuration is kept."
          {...form.getInputProps("enabled", { type: "checkbox" })}
        />
        <Group justify="flex-end" mt="md" wrap="nowrap">
          {isEdit && (
            <Button type="button" color="red" variant="light" onClick={openConfirm}>
              Delete
            </Button>
          )}
          <Button
            type="submit"
            fullWidth={!isEdit}
            loading={form.submitting}
            loaderProps={BUTTON_LOADER_PROPS}
          >
            {isEdit ? "Save changes" : "Create quick link"}
          </Button>
        </Group>

        <Modal
          opened={confirmOpened}
          onClose={closeConfirm}
          title="Delete quick link"
          centered
          size="sm"
        >
          <Stack>
            <Text>
              Delete &quot;{link?.label}&quot;? It will no longer appear in the quick-links menu.
            </Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeConfirm}>
                Cancel
              </Button>
              <Button
                color="red"
                loading={deleting}
                loaderProps={BUTTON_LOADER_PROPS}
                onClick={confirmDelete}
              >
                Delete
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </form>
  );
}
