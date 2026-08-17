"use client";

import { useForm } from "@mantine/form";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import {
  createEventType,
  deleteEventType,
  renameEventType,
  type EventTypeActionResult,
} from "@/lib/eventTypes/actions";
import {
  validateEventTypeForm,
  type EventTypeFormValues,
} from "@/lib/eventTypes/validate";

interface EventTypeFormProps {
  eventType: { id: string; name: string; shortname: string | null } | null;
  onDone: () => void;
}

export function EventTypeForm({ eventType, onDone }: EventTypeFormProps) {
  const isEdit = eventType !== null;
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);

  const form = useForm<EventTypeFormValues>({
    initialValues: {
      name: eventType?.name ?? "",
      shortname: eventType?.shortname ?? "",
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
        message: isEdit ? "Event type updated" : "Event type created",
      });
      onDone();
      return;
    }

    if (result.field === "name") {
      form.setFieldError("name", result.error);
    } else if (result.field === "shortname") {
      form.setFieldError("shortname", result.error);
    }
    notifications.show({ color: "red", message: result.error });
  });

  async function confirmDelete() {
    if (!eventType) {
      return;
    }
    const result = await deleteEventType(eventType.id);
    closeConfirm();
    if (result.ok) {
      notifications.show({ color: "green", message: "Event type deleted" });
      onDone();
    } else {
      notifications.show({ color: "red", message: result.error });
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput
          label="Name"
          required
          placeholder="Event type name"
          {...form.getInputProps("name")}
        />
        <TextInput
          label="Shortname"
          required
          placeholder="LV"
          description="Short acronym shown via the {type:acronym} event title token"
          {...form.getInputProps("shortname")}
        />
        <Group justify="flex-end" mt="md" wrap="nowrap">
          {isEdit && (
            <Button type="button" color="red" variant="light" onClick={openConfirm}>
              Delete
            </Button>
          )}
          <Button type="submit" fullWidth={!isEdit}>
            {isEdit ? "Save changes" : "Create event type"}
          </Button>
        </Group>

        <Modal
          opened={confirmOpened}
          onClose={closeConfirm}
          title="Delete event type"
          centered
          size="sm"
        >
          <Stack>
            <Text>Delete &quot;{eventType?.name}&quot;?</Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeConfirm}>
                Cancel
              </Button>
              <Button color="red" onClick={confirmDelete}>
                Delete
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </form>
  );
}
