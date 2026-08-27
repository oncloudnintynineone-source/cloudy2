"use client";

import { useEffect, useState } from "react";
import {
  Anchor,
  Badge,
  Button,
  CopyButton,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconCopy, IconPlus } from "@tabler/icons-react";

import type { Calendar } from "@/db/schema";
import {
  createDepartment,
  getDepartmentAccess,
  grantDepartmentAccess,
  renameDepartment,
  revokeDepartmentAccess,
  updateDepartmentAccess,
  type RosterActionResult,
} from "@/lib/roster/actions";
import type { DepartmentAccess, DepartmentAccessRole } from "@/lib/roster/shares";
import { validateCalendarForm, type CalendarFormValues } from "@/lib/roster/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";
import { ColorSwatchPicker } from "@/components/ColorSwatchPicker";

const ACCESS_ROLE_OPTIONS = [
  { value: "reader", label: "Read only" },
  { value: "writer", label: "Can edit" },
  { value: "owner", label: "Owner" },
];

const ACCESS_ROLE_LABELS: Record<string, string> = {
  reader: "Read only",
  writer: "Can edit",
  owner: "Owner",
};

function roleLabel(role: string | undefined): string {
  if (!role) {
    return "Read only";
  }
  return ACCESS_ROLE_LABELS[role] ?? role;
}

interface DepartmentDetailProps {
  /** The department to manage; null opens the create flow. */
  calendar: Calendar | null;
  opened: boolean;
  onClose: () => void;
  /** After an existing department is saved: update its list row in place. */
  onSaved: (calendar: Calendar) => void;
  /** After a new department is created: close and refresh the list. */
  onCreate: () => void;
  /** Ask the parent to show the delete confirmation for this department. */
  onRequestDelete: (calendar: Calendar) => void;
}

interface DepartmentDetailBodyProps {
  calendar: Calendar | null;
  onSaved: (calendar: Calendar) => void;
  onCreate: () => void;
  onRequestDelete: (calendar: Calendar) => void;
}

export function DepartmentDetail({
  calendar,
  opened,
  onClose,
  onSaved,
  onCreate,
  onRequestDelete,
}: DepartmentDetailProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={calendar ? "Manage department" : "Add department"}
      centered
      size="md"
    >
      {/* Keyed per department: the modal unmounts its content when closed, so
          the body (form state + access data) is remounted fresh on every open
          and seeded from the tapped row; the key also covers a target switch
          while the modal is somehow still mounted. */}
      <DepartmentDetailBody
        key={calendar?.id ?? "new"}
        calendar={calendar}
        onSaved={onSaved}
        onCreate={onCreate}
        onRequestDelete={onRequestDelete}
      />
    </Modal>
  );
}

function DepartmentDetailBody({
  calendar,
  onSaved,
  onCreate,
  onRequestDelete,
}: DepartmentDetailBodyProps) {
  const isEdit = calendar !== null;
  const calendarId = calendar?.id ?? null;

  const form = useForm<CalendarFormValues>({
    initialValues: {
      name: calendar?.name ?? "",
      color: calendar?.color ?? "",
    },
    validate: (values) => validateCalendarForm(values),
    validateInputOnBlur: true,
  });

  const [data, setData] = useState<DepartmentAccess | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DepartmentAccessRole>("reader");
  const [adding, setAdding] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null);

  useEffect(() => {
    if (calendarId) {
      getDepartmentAccess(calendarId).then(setData);
    }
  }, [calendarId]);

  async function reload() {
    if (!calendarId) {
      return;
    }
    setData(await getDepartmentAccess(calendarId));
  }

  const onSubmit = form.onSubmit(
    async (values) => {
      const result: RosterActionResult = isEdit
        ? await renameDepartment(calendar.id, values)
        : await createDepartment(values);

      if (result.ok) {
        const message = isEdit ? "Department updated" : "Department created";
        if (result.warnings && result.warnings.length > 0) {
          notifications.show({
            color: "yellow",
            title: message,
            message: result.warnings.join(" · "),
          });
        } else {
          notifications.show({ color: "green", message });
        }
        if (isEdit && calendar) {
          onSaved({ ...calendar, name: values.name, color: values.color || null });
        } else {
          onCreate();
        }
        return;
      }

      if (result.field === "name") {
        form.setFieldError("name", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  // Role changes apply immediately (same as the additional-access selectors)
  // and are written directly to Google's ACLs; the reload picks up the new
  // role from the ACLs, which the reconcile-on-read then preserves.
  async function handleAssignedRoleChange(accessEmail: string, nextRole: DepartmentAccessRole) {
    if (!calendar || updatingEmail) {
      return;
    }
    setUpdatingEmail(accessEmail);
    try {
      const result = await updateDepartmentAccess(calendar.id, accessEmail, nextRole);
      if (result.ok) {
        notifications.show({ color: "green", message: "Access level updated" });
        await reload();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setUpdatingEmail(null);
    }
  }

  async function handleAdd() {
    if (!calendar || adding) {
      return;
    }
    setAdding(true);
    try {
      const result = await grantDepartmentAccess(calendar.id, email, role);
      if (result.ok) {
        notifications.show({ color: "green", message: "Access granted" });
        setEmail("");
        await reload();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(accessEmail: string, nextRole: DepartmentAccessRole) {
    if (!calendar || updatingEmail) {
      return;
    }
    setUpdatingEmail(accessEmail);
    try {
      const result = await updateDepartmentAccess(calendar.id, accessEmail, nextRole);
      if (result.ok) {
        notifications.show({ color: "green", message: "Access level updated" });
        await reload();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setUpdatingEmail(null);
    }
  }

  async function handleRemove(accessEmail: string) {
    if (!calendar || removingEmail) {
      return;
    }
    setRemovingEmail(accessEmail);
    try {
      const result = await revokeDepartmentAccess(calendar.id, accessEmail);
      if (result.ok) {
        notifications.show({ color: "green", message: "Access removed" });
        await reload();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setRemovingEmail(null);
    }
  }

  const addHref = calendar
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendar.googleCalendarId)}`
    : undefined;

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
            Color for events created directly in Google (no event type). Typed events use the color
            of their event type. Auto keeps the default color for this calendar.
          </Text>
        </Stack>

        {calendar && (
          <>
            <Divider label="Calendar access" labelPosition="left" my="sm" />

            {data?.syncWarning ? (
              <Text size="sm" c="orange">
                {data.syncWarning}
              </Text>
            ) : null}

            <Paper withBorder p="xs" radius="md">
              <Stack gap={6}>
                <Text size="sm" c="dimmed" style={{ wordBreak: "break-all" }}>
                  {calendar.googleCalendarId}
                </Text>
                <Group gap={6} wrap="wrap">
                  <CopyButton value={calendar.googleCalendarId}>
                    {({ copied, copy }) => (
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        onClick={copy}
                      >
                        {copied ? "Copied" : "Copy calendar ID"}
                      </Button>
                    )}
                  </CopyButton>
                  <Anchor href={addHref} target="_blank" rel="noreferrer" size="sm">
                    Add to my Google Calendar
                  </Anchor>
                </Group>
              </Stack>
            </Paper>

            <Text size="sm" c="dimmed">
              Assigned users are shared automatically — read only by default. Use the selector to
              give a user more access, or add other people with any access level.
            </Text>

            {calendarId && !data ? (
              <Group justify="center" py="lg">
                <Loader size="sm" />
              </Group>
            ) : (
              <>
                {data?.admin ? (
                  <Stack gap={6}>
                    <Text fw={600} size="sm">
                      Owner access
                    </Text>
                    <Group gap={6}>
                      <Badge color="brand">{data.admin} · owner</Badge>
                    </Group>
                  </Stack>
                ) : null}

                <Stack gap={6}>
                  <Text fw={600} size="sm">
                    Assigned users
                  </Text>
                  {data && data.assigned.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      No assigned users with an email in this department.
                    </Text>
                  ) : (
                    data?.assigned.map((assignedEmail) => {
                      const currentRole = data?.assignedRoles[assignedEmail] ?? "reader";
                      return (
                        <Paper key={assignedEmail} withBorder p="xs" radius="md">
                          <Group justify="space-between" wrap="nowrap" align="center">
                            <Text size="sm" style={{ wordBreak: "break-all" }}>
                              {assignedEmail}
                            </Text>
                            <Select
                              size="xs"
                              aria-label={`Access level for ${assignedEmail}`}
                              data={ACCESS_ROLE_OPTIONS}
                              value={currentRole}
                              loading={updatingEmail === assignedEmail}
                              style={{ width: 132, flexShrink: 0 }}
                              onChange={(value) => {
                                if (value) {
                                  handleAssignedRoleChange(
                                    assignedEmail,
                                    value as DepartmentAccessRole,
                                  );
                                }
                              }}
                            />
                          </Group>
                        </Paper>
                      );
                    })
                  )}
                </Stack>

                <Stack gap={6}>
                  <Text fw={600} size="sm">
                    Additional access
                  </Text>
                  {data && data.additional.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      No additional people are shared with this calendar.
                    </Text>
                  ) : (
                    data?.additional.map((rule) => (
                      <Paper key={rule.email} withBorder p="xs" radius="md">
                        <Stack gap={6}>
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" style={{ wordBreak: "break-all" }}>
                              {rule.email}
                              <Text span c="dimmed">
                                {" "}
                                · {roleLabel(rule.role)}
                              </Text>
                            </Text>
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              loading={removingEmail === rule.email}
                              loaderProps={BUTTON_LOADER_PROPS}
                              onClick={() => handleRemove(rule.email)}
                            >
                              Remove
                            </Button>
                          </Group>
                          <Select
                            size="xs"
                            aria-label={`Access level for ${rule.email}`}
                            data={ACCESS_ROLE_OPTIONS}
                            value={rule.role}
                            placeholder={roleLabel(rule.role)}
                            loading={updatingEmail === rule.email}
                            disabled={removingEmail === rule.email}
                            onChange={(value) => {
                              if (value) {
                                handleRoleChange(rule.email, value as DepartmentAccessRole);
                              }
                            }}
                          />
                        </Stack>
                      </Paper>
                    ))
                  )}
                </Stack>

                <Stack gap={4}>
                  <Select
                    label="Access level"
                    data={ACCESS_ROLE_OPTIONS}
                    value={role}
                    onChange={(value) => {
                      if (value) {
                        setRole(value as DepartmentAccessRole);
                      }
                    }}
                  />
                  <Group gap={4} wrap="nowrap">
                    <TextInput
                      placeholder="person@example.com"
                      aria-label="Email to share with"
                      value={email}
                      onChange={(e) => setEmail(e.currentTarget.value)}
                      style={{ flex: 1 }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAdd();
                        }
                      }}
                    />
                    <Button
                      loading={adding}
                      loaderProps={BUTTON_LOADER_PROPS}
                      leftSection={<IconPlus size={16} />}
                      onClick={handleAdd}
                    >
                      Add
                    </Button>
                  </Group>
                </Stack>
              </>
            )}
          </>
        )}

        <Group justify={isEdit ? "space-between" : "flex-end"} mt="md" wrap="nowrap">
          {isEdit && calendar && (
            <Button variant="subtle" color="red" onClick={() => onRequestDelete(calendar)}>
              Delete department
            </Button>
          )}
          <Button type="submit" loading={form.submitting} loaderProps={BUTTON_LOADER_PROPS}>
            {isEdit ? "Save changes" : "Create department"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
