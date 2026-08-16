"use client";

import { useForm } from "@mantine/form";
import { Button, Group, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import {
  createEventType,
  renameEventType,
  type EventTypeActionResult,
} from "@/lib/eventTypes/actions";
import {
  validateEventTypeForm,
  type EventTypeFormValues,
} from "@/lib/eventTypes/validate";

interface EventTypeFormProps {
  eventType: { id: string; name: string } | null;
  onDone: () => void;
}

export function EventTypeForm({ eventType, onDone }: EventTypeFormProps) {
  const isEdit = eventType !== null;

  const form = useForm<EventTypeFormValues>({
    initialValues: {
      name: eventType?.name ?? "",
    },
    validate: (values) => validateEventTypeForm(values),
  });

  const onSubmit = form.onSubmit(async (values) => {
    const result: EventTypeActionResult = isEdit
      ? await renameEventType(eventType.id, values)
      : await createEventType(values);

    if (result.ok) {
      notifications.show({
        color: "green",
        message: isEdit ? "Event type renamed" : "Event type created",
      });
      onDone();
      return;
    }

    if (result.field === "name") {
      form.setFieldError("name", result.error);
    }
    notifications.show({ color: "red", message: result.error });
  });

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput
          label="Name"
          required
          placeholder="Event type name"
          {...form.getInputProps("name")}
        />
        <Group justify="flex-end" mt="md">
          <Button type="submit" fullWidth>
            {isEdit ? "Save changes" : "Create event type"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
