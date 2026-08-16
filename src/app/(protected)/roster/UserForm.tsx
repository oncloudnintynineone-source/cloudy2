"use client";

import { useForm } from "@mantine/form";
import { Button, Group, MultiSelect, Select, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { createUser, updateUser, type RosterActionResult } from "@/lib/roster/actions";
import type { RosterUser } from "@/lib/roster/queries";
import { validateUserForm, type UserFormValues } from "@/lib/roster/validate";

export interface DepartmentOption {
  id: string;
  name: string;
}

interface UserFormProps {
  user: RosterUser | null;
  departments: DepartmentOption[];
  onDone: () => void;
}

function initialValues(user: RosterUser | null): UserFormValues {
  if (!user) {
    return {
      name: "",
      phone: "",
      email: "",
      birthday: "",
      role: "user",
      status: "active",
      departmentIds: [],
      primaryDepartmentId: null,
    };
  }
  return {
    name: user.name,
    phone: user.phone,
    email: user.email ?? "",
    birthday: user.birthday ?? "",
    role: user.role,
    status: user.status,
    departmentIds: user.departments.map((d) => d.id),
    primaryDepartmentId: user.departments.find((d) => d.isPrimary)?.id ?? null,
  };
}

export function UserForm({ user, departments, onDone }: UserFormProps) {
  const isEdit = user !== null;

  const form = useForm<UserFormValues>({
    // The parent remounts this component (key) when the target user changes,
    // so initialValues are computed once per mount and stay correct.
    initialValues: initialValues(user),
    validate: (values) => validateUserForm(values),
  });

  const onSubmit = form.onSubmit(async (values) => {
    const result: RosterActionResult = isEdit
      ? await updateUser(user.id, values)
      : await createUser(values);

    if (result.ok) {
      notifications.show({
        color: "green",
        message: isEdit ? "User updated" : "User created",
      });
      onDone();
      return;
    }

    if (result.field === "phone") {
      form.setFieldError("phone", result.error);
    }
    notifications.show({ color: "red", message: result.error });
  });

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput label="Name" required placeholder="Full name" {...form.getInputProps("name")} />
        <TextInput
          label="Phone"
          required
          placeholder="8-digit number"
          {...form.getInputProps("phone")}
        />
        <TextInput label="Email" placeholder="Optional" {...form.getInputProps("email")} />
        <TextInput label="Birthday" type="date" {...form.getInputProps("birthday")} />
        <Select
          label="Role"
          data={[
            { value: "user", label: "User" },
            { value: "admin", label: "Admin" },
          ]}
          {...form.getInputProps("role")}
        />
        <Select
          label="Status"
          data={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
          {...form.getInputProps("status")}
        />
        <MultiSelect
          label="Departments"
          data={departments.map((d) => ({ value: d.id, label: d.name }))}
          searchable
          clearable
          {...form.getInputProps("departmentIds")}
        />
        <Select
          label="Primary department"
          placeholder="Pick the primary department"
          data={form.values.departmentIds
            .map((id) => departments.find((d) => d.id === id))
            .filter((d): d is DepartmentOption => d !== undefined)
            .map((d) => ({ value: d.id, label: d.name }))}
          disabled={form.values.departmentIds.length === 0}
          {...form.getInputProps("primaryDepartmentId")}
        />
        <Group justify="flex-end" mt="md">
          <Button type="submit">{isEdit ? "Save changes" : "Create user"}</Button>
        </Group>
      </Stack>
    </form>
  );
}
