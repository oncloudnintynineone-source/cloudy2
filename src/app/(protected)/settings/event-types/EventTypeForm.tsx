"use client";

import { useState } from "react";
import { useForm } from "@mantine/form";
import { Button, Checkbox, Grid, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import {
  createEventType,
  deleteEventType,
  renameEventType,
  type EventTypeActionResult,
} from "@/lib/eventTypes/actions";
import { validateEventTypeForm, type EventTypeFormValues } from "@/lib/eventTypes/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";
import {
  LOCATION_CATEGORIES,
  LOCATION_CATEGORY_DESCRIPTIONS,
  LOCATION_CATEGORY_LABELS,
  normalizeAllowedLocations,
} from "@/lib/events/locationPolicy";
import { ColorSwatchPicker } from "@/components/ColorSwatchPicker";
import {
  TIME_OPTIONS,
  TIME_OPTION_DESCRIPTIONS,
  TIME_OPTION_LABELS,
  normalizeTimeOptions,
} from "@/lib/events/timeOptions";

interface EventTypeFormProps {
  eventType: {
    id: string;
    name: string;
    shortname: string | null;
    timeOptions: string[];
    allowedLocations: string[];
    showRemarks: boolean;
    color: string | null;
  } | null;
  onDone: () => void;
}

export function EventTypeForm({ eventType, onDone }: EventTypeFormProps) {
  const isEdit = eventType !== null;
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [deletingType, setDeletingType] = useState(false);

  const form = useForm<EventTypeFormValues>({
    initialValues: {
      name: eventType?.name ?? "",
      shortname: eventType?.shortname ?? "",
      timeOptions: eventType ? normalizeTimeOptions(eventType.timeOptions) : [],
      allowedLocations: eventType
        ? normalizeAllowedLocations(eventType.allowedLocations)
        : [...LOCATION_CATEGORIES],
      showRemarks: eventType ? eventType.showRemarks !== false : true,
      color: eventType?.color ?? "",
    },
    validate: (values) => validateEventTypeForm(values),
    validateInputOnBlur: true,
  });

  const onSubmit = form.onSubmit(
    async (values) => {
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
      } else if (result.field === "timeOptions") {
        form.setFieldError("timeOptions", result.error);
      } else if (result.field === "allowedLocations") {
        form.setFieldError("allowedLocations", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  async function confirmDelete() {
    if (!eventType || deletingType) {
      return;
    }
    setDeletingType(true);
    try {
      const result = await deleteEventType(eventType.id);
      closeConfirm();
      if (result.ok) {
        notifications.show({ color: "green", message: "Event type deleted" });
        onDone();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeletingType(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        {/* At lg the modal is wide enough for a two-column field grid. */}
        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <TextInput
              label="Name"
              required
              placeholder="Event type name"
              {...form.getInputProps("name")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <TextInput
              label="Shortname"
              required
              placeholder="LV"
              description="Short acronym shown via the {type:acronym} event title token"
              {...form.getInputProps("shortname")}
            />
          </Grid.Col>
        </Grid>

        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Checkbox.Group
              label="Time options"
              description="Which datetime selector users may use for events of this type"
              value={form.values.timeOptions}
              onChange={(value) =>
                form.setFieldValue("timeOptions", value as EventTypeFormValues["timeOptions"])
              }
              error={form.errors.timeOptions}
            >
              <Stack gap="xs" mt="xs">
                {TIME_OPTIONS.map((option) => (
                  <Checkbox
                    key={option}
                    value={option}
                    label={TIME_OPTION_LABELS[option]}
                    description={TIME_OPTION_DESCRIPTIONS[option]}
                  />
                ))}
              </Stack>
            </Checkbox.Group>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Checkbox.Group
              label="Allowed locations"
              description="Where events of this type may take place (at least one)"
              value={form.values.allowedLocations}
              onChange={(value) =>
                form.setFieldValue(
                  "allowedLocations",
                  value as EventTypeFormValues["allowedLocations"],
                )
              }
              error={form.errors.allowedLocations}
            >
              <Stack gap="xs" mt="xs">
                {LOCATION_CATEGORIES.map((category) => (
                  <Checkbox
                    key={category}
                    value={category}
                    label={LOCATION_CATEGORY_LABELS[category]}
                    description={LOCATION_CATEGORY_DESCRIPTIONS[category]}
                  />
                ))}
              </Stack>
            </Checkbox.Group>
            <Checkbox
              mt="lg"
              label="Show remarks in the event form"
              description="Events of this type may carry a description; hide it for types that don't need one"
              checked={form.values.showRemarks}
              onChange={(event) => form.setFieldValue("showRemarks", event.currentTarget.checked)}
            />
          </Grid.Col>

          {/* Swatch buttons (not an input), same no-keyboard rationale as the
              Role/Department badges in UserForm: tapping a swatch on mobile
              never raises the keyboard. */}
          <Grid.Col span={12}>
            <Stack gap={4}>
              <Text fw={500} size="sm">
                Event color
              </Text>
              <ColorSwatchPicker
                value={form.values.color ?? ""}
                onChange={(color) => form.setFieldValue("color", color)}
                autoRefId={eventType?.name ?? null}
              />
              <Text size="sm" c="dimmed">
                The color this type&apos;s events appear in. Auto uses a stable default derived
                from the type name.
              </Text>
            </Stack>
          </Grid.Col>
        </Grid>
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
              <Button
                color="red"
                loading={deletingType}
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
