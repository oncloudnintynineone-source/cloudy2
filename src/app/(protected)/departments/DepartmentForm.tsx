"use client";

import { useForm } from "@mantine/form";
import { Button, Group, NumberInput, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import {
  createDepartment,
  updateDepartment,
  type RosterActionResult,
} from "@/lib/roster/actions";
import { validateDepartmentForm, type DepartmentFormValues } from "@/lib/roster/validate";

interface DepartmentFormProps {
  department: { id: string; name: string; sortOrder: number } | null;
  onDone: () => void;
}

export function DepartmentForm({ department, onDone }: DepartmentFormProps) {
  const isEdit = department !== null;

  const form = useForm<DepartmentFormValues>({
    initialValues: {
      name: department?.name ?? "",
      sortOrder: department?.sortOrder ?? 0,
    },
    validate: (values) => validateDepartmentForm(values),
  });

  const onSubmit = form.onSubmit(async (values) => {
    const result: RosterActionResult = isEdit
      ? await updateDepartment(department.id, values)
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
  });

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput label="Name" required placeholder="Department name" {...form.getInputProps("name")} />
        <NumberInput
          label="Sort order"
          description="Lower numbers appear first"
          min={0}
          {...form.getInputProps("sortOrder")}
        />
        <Group justify="flex-end" mt="md">
          <Button type="submit">{isEdit ? "Save changes" : "Create department"}</Button>
        </Group>
      </Stack>
    </form>
  );
}
