"use client";

import { useState } from "react";
import {
  Switch,
  Button,
  Stack,
  TextInput,
} from "@mantine/core";
import { ConfirmModal } from "@/components/ConfirmModal";
import { FormFooterActions } from "@/components/FormFooterActions";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import {
  createWebhook,
  deleteWebhook,
  updateWebhook,
} from "@/lib/webhooks/actions";
import { validateWebhookForm, type WebhookFormValues } from "@/lib/webhooks/validate";
import { runConfirm } from "@/lib/ui/runConfirm";
import { submitCrudForm } from "@/lib/ui/submitCrudForm";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

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
    validateInputOnBlur: true,
  });

  const onSubmit = form.onSubmit(
    submitCrudForm({
      form,
      isEdit,
      create: createWebhook,
      update: (values) => updateWebhook(webhook!.id, values),
      success: { create: "Webhook endpoint created", update: "Webhook endpoint updated" },
      fieldMap: { name: "name", url: "url", secret: "secret" },
      onSuccess: () => onDone(),
    }),
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  async function confirmDelete() {
    if (!webhook || deletingWebhook) {
      return;
    }
    setDeletingWebhook(true);
    try {
      await runConfirm({
        call: () => deleteWebhook(webhook.id),
        onSuccess: () => {
          notifications.show({ color: "green", message: "Webhook endpoint deleted" });
          onDone();
        },
        onError: (message) => notifications.show({ color: "red", message }),
      });
      closeConfirm();
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
        <FormFooterActions
          isEdit={isEdit}
          loading={form.submitting}
          submitLabel={isEdit ? "Save changes" : "Create endpoint"}
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
          title="Delete webhook endpoint"
          message={
            <>
              Delete &quot;{webhook?.name}&quot;? External systems using this endpoint will stop
              receiving notifications.
            </>
          }
          loading={deletingWebhook}
          onConfirm={confirmDelete}
        />
      </Stack>
    </form>
  );
}
