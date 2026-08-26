"use client";

import { useForm } from "@mantine/form";
import { Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import {
  createDepartment,
  renameDepartment,
  type RosterActionResult,
} from "@/lib/roster/actions";
import { validateCalendarForm, type CalendarFormValues } from "@/lib/roster/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";
import { ColorSwatchPicker } from "@/components/ColorSwatchPicker";

interface DepartmentFormProps {
  calendar: { id: string; name: string; color: string | null } | null;
  onDone: () => void;
}

export function DepartmentForm({ calendar, onDone }: DepartmentFormProps) {
  const isEdit = calendar !== null;

  const form = useForm<CalendarFormValues>({
    initialValues: {
      name: calendar?.name ?? "",
      color: calendar?.color ?? "",
    },
    validate: (values) => validateCalendarForm(values),
    validateInputOnBlur: true,
  });

  const onSubmit = form.onSubmit(
    async (values) => {
      const result: RosterActionResult = isEdit
        ? await renameDepartment(calendar.id, values)
        : await createDepartment(values);

      if (result.ok) {
        notifications.show({
          color: "green",
          message: isEdit ? "Department updated" : "Department created",
        });
        onDone();
        return;
      }

      if (result.field === "name") {
        form.setFieldError("name", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput
          label="Name"
          required
          placeholder="Department name"
          {...form.getInputProps("name")}
        />
        {/* Swatch buttons (not an input), same no-keyboard rationale as the
            Role/Department badges in UserForm: tapping a swatch on mobile
            never raises the keyboard. */}
        <Stack gap={4} mt="md">
          <Text fw={500} size="sm">
            External event color
          </Text>
          <ColorSwatchPicker
            value={form.values.color ?? ""}
            onChange={(color) => form.setFieldValue("color", color)}
            autoRefId={calendar?.id ?? null}
          />
          <Text size="sm" c="dimmed">
            Color for events created directly in Google (no event type). Typed events use the
            color of their event type. Auto keeps the default color for this calendar.
          </Text>
        </Stack>
        <Group justify="flex-end" mt="md">
          <Button type="submit" fullWidth loading={form.submitting} loaderProps={BUTTON_LOADER_PROPS}>
            {isEdit ? "Save changes" : "Create department"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
