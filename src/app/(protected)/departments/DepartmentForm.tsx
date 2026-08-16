"use client";

import { useForm } from "@mantine/form";
import { Button, Group, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import {
  createDepartment,
  renameDepartment,
  type RosterActionResult,
} from "@/lib/roster/actions";
import { validateCalendarForm, type CalendarFormValues } from "@/lib/roster/validate";

interface DepartmentFormProps {
  calendar: { id: string; name: string } | null;
  onDone: () => void;
}

export function DepartmentForm({ calendar, onDone }: DepartmentFormProps) {
  const isEdit = calendar !== null;

  const form = useForm<CalendarFormValues>({
    initialValues: {
      name: calendar?.name ?? "",
    },
    validate: (values) => validateCalendarForm(values),
  });

  const onSubmit = form.onSubmit(async (values) => {
    const result: RosterActionResult = isEdit
      ? await renameDepartment(calendar.id, values)
      : await createDepartment(values);

    if (result.ok) {
      notifications.show({
        color: "green",
        message: isEdit ? "Department renamed" : "Department created",
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
          placeholder="Department name"
          {...form.getInputProps("name")}
        />
        <Group justify="flex-end" mt="md">
          <Button type="submit">{isEdit ? "Save changes" : "Create department"}</Button>
        </Group>
      </Stack>
    </form>
  );
}
