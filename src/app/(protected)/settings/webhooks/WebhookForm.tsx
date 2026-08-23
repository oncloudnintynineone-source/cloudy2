"use client";

import { useState } from "react";
import { Switch, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import {
  createWebhook,
  deleteWebhook,
  updateWebhook,
  type WebhookActionResult,
} from "@/lib/webhooks/actions";
import { validateWebhookForm, type WebhookFormValues } from "@/lib/webhooks/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

interface WebhookFormProps {
  webhook: {
    id: string;
    name: string;
    url: string;
    secret: string;
    enabled: boolean;
  } | null;
  onDone: () => void;
}

export function WebhookForm({ webhook, onDone }: WebhookFormProps) {
  const isEdit = webhook !== null;
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [deletingWebhook, setDeletingWebhook] = useState(false);

  const form = useForm<WebhookFormValues>({
    initialValues: {
      name: webhook?.name ?? "",
      url: webhook?.url ?? "",
      secret: webhook?.secret ?? "",
      enabled: webhook?.enabled ?? true,
    },
    validate: (values) => validateWebhookForm(values),
  });

  const onSubmit = form.onSubmit(async (values) => {
    const result: WebhookActionResult = isEdit
      ? await updateWebhook(webhook.id, values)
      : await createWebhook(values);

    if (result.ok) {
      notifications.show({
        color: "green",
        message: isEdit ? "Webhook endpoint updated" : "Webhook endpoint created",
      });
      onDone();
      return;
    }

    if (result.field === "name") {
      form.setFieldError("name", result.error);
    } else if (result.field === "url") {
      form.setFieldError("url", result.error);
    } else if (result.field === "secret") {
      form.setFieldError("secret", result.error);
    }
    notifications.show({ color: "red", message: result.error });
  });

  async function confirmDelete() {
    if (!webhook || deletingWebhook) {
      return;
    }
    setDeletingWebhook(true);
    try {
      const result = await deleteWebhook(webhook.id);
      closeConfirm();
      if (result.ok) {
        notifications.show({ color: "green", message: "Webhook endpoint deleted" });
        onDone();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeletingWebhook(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput
          label="Name"
          required
          placeholder="Ops channel"
          description="Label shown in this list and the audit log"
          {...form.getInputProps("name")}
        />
        <TextInput
          label="URL"
          required
          placeholder="https://example.com/hooks/cloudy2"
          description="The HTTPS endpoint that receives event notifications"
          {...form.getInputProps("url")}
        />
        <TextInput
          type="password"
          label="Signing Secret"
          description={
            'Optional shared secret; deliveries carry an X-Cloudy2-Signature header (HMAC-SHA256 of "timestamp.body") receivers can verify.'
          }
          {...form.getInputProps("secret")}
        />
        <Switch
          label="Enabled"
          description="Disabled endpoints receive no deliveries; their configuration is kept."
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
            {isEdit ? "Save changes" : "Create endpoint"}
          </Button>
        </Group>

        <Modal opened={confirmOpened} onClose={closeConfirm} title="Delete webhook endpoint" centered size="sm">
          <Stack>
            <Text>
              Delete &quot;{webhook?.name}&quot;? External systems using this endpoint will stop
              receiving notifications.
            </Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeConfirm}>
                Cancel
              </Button>
              <Button
                color="red"
                loading={deletingWebhook}
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
