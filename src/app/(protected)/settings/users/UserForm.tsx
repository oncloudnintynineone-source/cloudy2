"use client";

import { useState } from "react";
import { useForm } from "@mantine/form";
import { Badge, Button, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { BUTTON_LOADER_PROPS } from "@/lib/theme";

import {
  createUser,
  setUserStatus,
  updateUser,
  type RosterActionResult,
} from "@/lib/roster/actions";
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
      shortname: "",
      phone: "",
      email: "",
      birthday: "",
      role: "user",
      status: "active",
      departmentId: null,
    };
  }
  return {
    name: user.name,
    shortname: user.shortname ?? "",
    phone: user.phone,
    email: user.email ?? "",
    birthday: user.birthday ?? "",
    role: user.role,
    status: user.status,
    departmentId: user.department?.id ?? null,
  };
}

export function UserForm({ user, departments, onDone }: UserFormProps) {
  const isEdit = user !== null;
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

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
      const message = isEdit ? "User updated" : "User created";
      if (result.warnings && result.warnings.length > 0) {
        notifications.show({
          color: "yellow",
          title: message,
          message: result.warnings.join(" · "),
        });
      } else {
        notifications.show({ color: "green", message });
      }
      onDone();
      return;
    }

    if (result.field === "phone") {
      form.setFieldError("phone", result.error);
    }
    if (result.field === "shortname") {
      form.setFieldError("shortname", result.error);
    }
    notifications.show({ color: "red", message: result.error });
  });

  async function handleToggleStatus() {
    if (!isEdit || !user || togglingStatus) return;
    const next = user.status === "active" ? "inactive" : "active";
    setTogglingStatus(true);
    try {
      const result = await setUserStatus(user.id, next);
      closeConfirm();
      if (result.ok) {
        notifications.show({
          color: "green",
          message: next === "active" ? "User activated" : "User deactivated",
        });
        onDone();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setTogglingStatus(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput label="Name" required placeholder="Full name" {...form.getInputProps("name")} />
        <TextInput
          label="Shortname"
          required
          placeholder="e.g. ALICE"
          {...form.getInputProps("shortname")}
        />
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
        {/* Department as toggleable badges instead of a Select: the list is
            short, always visible, and tapping a badge never focuses an input,
            so it can't raise the mobile keyboard or trigger the browser's
            focus-scroll (which the old Select did on Android/iOS). Tapping the
            selected badge clears the field, mirroring the old clearable
            Select. */}
        <Stack gap={4}>
          <Text fw={500} size="sm">
            Department
          </Text>
          {departments.length === 0 ? (
            <Text size="sm" c="dimmed">
              No departments yet
            </Text>
          ) : (
            <Group gap={6} wrap="wrap">
              {departments.map((department) => {
                const selected = form.values.departmentId === department.id;
                return (
                  <Badge
                    key={department.id}
                    variant={selected ? "filled" : "light"}
                    size="lg"
                    style={{ height: "calc(var(--badge-height-lg) * 1.5)", cursor: "pointer" }}
                    onClick={() =>
                      form.setFieldValue("departmentId", selected ? null : department.id)
                    }
                  >
                    {department.name}
                  </Badge>
                );
              })}
            </Group>
          )}
        </Stack>
        <Group justify="flex-end" mt="md">
          {isEdit && (
            <Button
              type="button"
              color={user.status === "active" ? "red" : "teal"}
              variant="light"
              onClick={openConfirm}
            >
              {user.status === "active" ? "Deactivate user" : "Activate user"}
            </Button>
          )}
          <Button
            type="submit"
            fullWidth={!isEdit}
            loading={form.submitting}
            loaderProps={BUTTON_LOADER_PROPS}
          >
            {isEdit ? "Save changes" : "Create user"}
          </Button>
        </Group>

        <Modal
          opened={confirmOpened}
          onClose={closeConfirm}
          title={isEdit && user.status === "active" ? "Deactivate user" : "Activate user"}
          centered
          size="sm"
        >
          <Stack>
            <Text>
              Are you sure you want to {user?.status === "active" ? "deactivate" : "activate"}{" "}
              {user?.name}?
            </Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeConfirm}>
                Cancel
              </Button>
              <Button
                color={user?.status === "active" ? "red" : "teal"}
                loading={togglingStatus}
                loaderProps={BUTTON_LOADER_PROPS}
                onClick={handleToggleStatus}
              >
                Confirm
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </form>
  );
}
