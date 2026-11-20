"use client";

import { useState } from "react";
import {
  Switch,
  Button,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { ConfirmModal } from "@/components/ConfirmModal";
import { FormFooterActions } from "@/components/FormFooterActions";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { ColorSwatchPicker } from "@/components/ColorSwatchPicker";
import { QuickLinkIconPicker } from "@/components/QuickLinkIconPicker";
import {
  createQuickLink,
  deleteQuickLink,
  updateQuickLink,
} from "@/lib/quickLinks/actions";
import { DEFAULT_QUICK_LINK_ICON } from "@/lib/quickLinks/icons";
import { validateQuickLinkForm, type QuickLinkFormValues } from "@/lib/quickLinks/validate";
import { runConfirm } from "@/lib/ui/runConfirm";
import { submitCrudForm } from "@/lib/ui/submitCrudForm";
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
    submitCrudForm({
      form,
      isEdit,
      create: createQuickLink,
      update: (values) => updateQuickLink(link!.id, values),
      success: { create: "Quick link created", update: "Quick link updated" },
      fieldMap: { label: "label", url: "url" },
      onSuccess: () => onDone(),
    }),
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  async function confirmDelete() {
    if (!link || deleting) {
      return;
    }
    setDeleting(true);
    try {
      await runConfirm({
        call: () => deleteQuickLink(link.id),
        onSuccess: () => {
          notifications.show({ color: "green", message: "Quick link deleted" });
          onDone();
        },
        onError: (message) => notifications.show({ color: "red", message }),
      });
      closeConfirm();
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
        <FormFooterActions
          isEdit={isEdit}
          loading={form.submitting}
          submitLabel={isEdit ? "Save changes" : "Create quick link"}
          fullWidthOnCreate
          secondary={
            isEdit ? (
              <Button type="button" color="red" variant="light" onClick={openConfirm}>
                Delete
              </Button>
            ) : null
          }
        />

        <ConfirmModal
          opened={confirmOpened}
          onClose={closeConfirm}
          title="Delete quick link"
          message={
            <>
              Delete &quot;{link?.label}&quot;? It will no longer appear in the quick-links menu.
            </>
          }
          loading={deleting}
          onConfirm={confirmDelete}
        />
      </Stack>
    </form>
  );
}
