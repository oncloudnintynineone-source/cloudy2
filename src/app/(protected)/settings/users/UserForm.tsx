"use client";

import { useState } from "react";
import { useForm } from "@mantine/form";
import {
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconX } from "@tabler/icons-react";

import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

import {
  createUser,
  setUserStatus,
  updateUser,
  type RosterActionResult,
} from "@/lib/roster/actions";
import type { RosterAccessGrant, RosterUser } from "@/lib/roster/queries";
import type { ManagedGrantRole, UserCalendarGrant } from "@/lib/roster/shares";
import { validateUserForm, type UserFormValues } from "@/lib/roster/validate";
import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";

const ACCESS_ROLE_OPTIONS: { value: ManagedGrantRole; label: string }[] = [
  { value: "reader", label: "Read only" },
  { value: "writer", label: "Can edit" },
];

export interface DepartmentOption {
  id: string;
  name: string;
}

interface UserFormProps {
  user: RosterUser | null;
  departments: DepartmentOption[];
  /** The user's current cross-department grants (from the server, per user). */
  access: RosterAccessGrant[];
  onDone: () => void;
}

function initialValues(user: RosterUser | null, access: RosterAccessGrant[]): UserFormValues {
  const grants: UserCalendarGrant[] = access.map((grant) => ({
    calendarId: grant.calendarId,
    role: grant.role,
  }));
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
      access: grants,
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
    access: grants,
  };
}

export function UserForm({ user, departments, access, onDone }: UserFormProps) {
  const isEdit = user !== null;
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [addingCalendarId, setAddingCalendarId] = useState<string>("");
  const [addingRole, setAddingRole] = useState<ManagedGrantRole>("reader");

  const form = useForm<UserFormValues>({
    // The parent remounts this component (key) when the target user changes,
    // so initialValues are computed once per mount and stay correct.
    initialValues: initialValues(user, access),
    validate: (values) => validateUserForm(values),
    // Validate as soon as a field loses focus: the inline error appears
    // without waiting for a submit (errors clear on the next edit).
    validateInputOnBlur: true,
  });

  const onSubmit = form.onSubmit(
    async (values) => {
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
    },
    // Client-side validation failure: inline field errors alone are easy to
    // miss (submit button is far from the invalid fields), so also toast and
    // scroll the first invalid field into view.
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

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

  const granted = form.values.access ?? [];

  /** Department display name for a grant (unknown ids fall back to the id). */
  function departmentName(calendarId: string): string {
    return departments.find((department) => department.id === calendarId)?.name ?? calendarId;
  }

  /** Departments that can still be granted (not the user's own, not added). */
  const addableDepartments = departments.filter(
    (department) =>
      department.id !== form.values.departmentId &&
      !granted.some((grant) => grant.calendarId === department.id),
  );

  function addGrant(calendarId: string, role: ManagedGrantRole) {
    if (!calendarId || granted.some((grant) => grant.calendarId === calendarId)) {
      return;
    }
    form.setFieldValue("access", [...granted, { calendarId, role }]);
    setAddingCalendarId("");
    setAddingRole("reader");
  }

  function removeGrant(calendarId: string) {
    form.setFieldValue(
      "access",
      granted.filter((grant) => grant.calendarId !== calendarId),
    );
  }

  function changeGrantRole(calendarId: string, role: ManagedGrantRole) {
    form.setFieldValue(
      "access",
      granted.map((grant) => (grant.calendarId === calendarId ? { calendarId, role } : grant)),
    );
  }

  /** The selected department becomes the user's own — drop any matching grant. */
  function selectDepartment(departmentId: string | null) {
    form.setFieldValue("departmentId", departmentId);
    if (departmentId && granted.some((grant) => grant.calendarId === departmentId)) {
      removeGrant(departmentId);
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
              placeholder="Full name"
              {...form.getInputProps("name")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <TextInput
              label="Shortname"
              required
              placeholder="e.g. ALICE"
              {...form.getInputProps("shortname")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <TextInput
              label="Phone"
              required
              placeholder="8-digit number"
              {...form.getInputProps("phone")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <TextInput label="Email" placeholder="Optional" {...form.getInputProps("email")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <TextInput label="Birthday" type="date" {...form.getInputProps("birthday")} />
          </Grid.Col>
        </Grid>
        {/* Role as toggleable badges, same pattern as Department: the two
            options are always visible and tapping a badge never focuses an
            input, so it can't raise the mobile keyboard. Role is required,
            so tapping a badge always selects it (no toggle-off). Colors
            mirror UserTable: admin = brand, user = gray. */}
        <Stack gap={4}>
          <Text fw={500} size="sm">
            Role
          </Text>
          <Group gap={6} wrap="wrap">
            {(
              [
                { value: "user", label: "User", color: "gray" },
                { value: "admin", label: "Admin", color: "brand" },
              ] as const
            ).map((option) => {
              const selected = form.values.role === option.value;
              return (
                // A real button (not an onClick Badge): keyboard-operable and
                // announces its pressed state. The Badge keeps the visual.
                <UnstyledButton
                  key={option.value}
                  aria-pressed={selected}
                  aria-label={`Role: ${option.label}`}
                  onClick={() => form.setFieldValue("role", option.value)}
                  style={{ cursor: "pointer", borderRadius: "var(--mantine-radius-md)" }}
                >
                  <Badge
                    color={option.color}
                    variant={selected ? "filled" : "light"}
                    size="lg"
                    style={{ height: "calc(var(--badge-height-lg) * 1.5)" }}
                  >
                    {option.label}
                  </Badge>
                </UnstyledButton>
              );
            })}
          </Group>
        </Stack>
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
                  // Real toggle button (aria-pressed), Badge visual — same
                  // keyboard/no-keyboard rationale as the Role badges above.
                  <UnstyledButton
                    key={department.id}
                    aria-pressed={selected}
                    aria-label={`Department: ${department.name}`}
                    onClick={() => selectDepartment(selected ? null : department.id)}
                    style={{ cursor: "pointer", borderRadius: "var(--mantine-radius-md)" }}
                  >
                    <Badge
                      variant={selected ? "filled" : "light"}
                      size="lg"
                      style={{ height: "calc(var(--badge-height-lg) * 1.5)" }}
                    >
                      {department.name}
                    </Badge>
                  </UnstyledButton>
                );
              })}
            </Group>
          )}
        </Stack>

        {/* Cross-department access: department calendars this user may see
            beyond their own. Grants are managed here (never as anonymous
            emails in a department's Additional access); their own department
            is always shared automatically. Filter availability is unrelated —
            every user can filter every department calendar anyway. */}
        <Stack gap={6}>
          <Stack gap={2}>
            <Text fw={500} size="sm">
              Department access
            </Text>
            <Text size="sm" c="dimmed">
              Other department calendars this user can see — Read only or Can edit. Their own
              department is always shared automatically.
            </Text>
          </Stack>

          {granted.length === 0 ? (
            <Text size="sm" c="dimmed">
              No extra access yet.
            </Text>
          ) : (
            granted.map((grant) => (
              <Paper key={grant.calendarId} withBorder p="xs" radius="md">
                <Group justify="space-between" wrap="nowrap" align="center">
                  <Text size="sm" fw={500} style={{ minWidth: 0, flex: 1 }}>
                    {departmentName(grant.calendarId)}
                  </Text>
                  <Select
                    size="xs"
                    aria-label={`Access level for ${departmentName(grant.calendarId)}`}
                    data={ACCESS_ROLE_OPTIONS}
                    value={grant.role}
                    style={{ width: 132, flexShrink: 0 }}
                    onChange={(value) => {
                      if (value === "reader" || value === "writer") {
                        changeGrantRole(grant.calendarId, value);
                      }
                    }}
                  />
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    px={4}
                    aria-label={`Remove access to ${departmentName(grant.calendarId)}`}
                    onClick={() => removeGrant(grant.calendarId)}
                  >
                    <IconX size={14} />
                  </Button>
                </Group>
              </Paper>
            ))
          )}

          {departments.length > 0 && (
            <Group gap="xs" align="flex-end" wrap="wrap">
              <NoKeyboardSelect
                aria-label="Department to grant"
                placeholder={
                  addableDepartments.length > 0 ? "Add a department…" : "No more departments"
                }
                data={addableDepartments.map((department) => ({
                  value: department.id,
                  label: department.name,
                }))}
                value={addingCalendarId}
                onChange={(value) => setAddingCalendarId(value ?? "")}
                style={{ flex: 1, minWidth: 180 }}
                disabled={addableDepartments.length === 0}
              />
              <NoKeyboardSelect
                aria-label="Access level to grant"
                data={ACCESS_ROLE_OPTIONS}
                value={addingRole}
                onChange={(value) => {
                  if (value === "reader" || value === "writer") {
                    setAddingRole(value);
                  }
                }}
                style={{ width: 132, flexShrink: 0 }}
              />
              <Button
                variant="light"
                leftSection={<IconPlus size={16} />}
                disabled={!addingCalendarId}
                onClick={() => addGrant(addingCalendarId, addingRole)}
              >
                Add
              </Button>
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
