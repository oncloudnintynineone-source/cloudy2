"use client";

import { useEffect, useState } from "react";
import {
  Anchor,
  Badge,
  Button,
  CopyButton,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconCopy, IconPlus } from "@tabler/icons-react";

import type { Calendar } from "@/db/schema";
import {
  getDepartmentAccess,
  grantDepartmentAccess,
  revokeDepartmentAccess,
} from "@/lib/roster/actions";
import type { DepartmentAccess } from "@/lib/roster/shares";

interface DepartmentSharesProps {
  calendar: Calendar | null;
  opened: boolean;
  onClose: () => void;
}

export function DepartmentShares({ calendar, opened, onClose }: DepartmentSharesProps) {
  const [data, setData] = useState<DepartmentAccess | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (opened && calendar) {
      getDepartmentAccess(calendar.id).then(setData);
    }
  }, [opened, calendar]);

  async function reload() {
    if (!calendar) {
      return;
    }
    setData(await getDepartmentAccess(calendar.id));
  }

  async function handleAdd() {
    if (!calendar) {
      return;
    }
    const result = await grantDepartmentAccess(calendar.id, email);
    if (result.ok) {
      notifications.show({ color: "green", message: "Access granted" });
      setEmail("");
      await reload();
    } else {
      notifications.show({ color: "red", message: result.error });
    }
  }

  async function handleRemove(accessEmail: string) {
    if (!calendar) {
      return;
    }
    const result = await revokeDepartmentAccess(calendar.id, accessEmail);
    if (result.ok) {
      notifications.show({ color: "green", message: "Access removed" });
      await reload();
    } else {
      notifications.show({ color: "red", message: result.error });
    }
  }

  const addHref = calendar
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendar.googleCalendarId)}`
    : undefined;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={calendar ? `Share: ${calendar.name}` : "Share calendar"}
      centered
      size="md"
    >
      <Stack>
        {data?.syncWarning ? (
          <Text size="sm" c="orange">
            {data.syncWarning}
          </Text>
        ) : null}

        {calendar ? (
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
        ) : null}

        <Text size="sm" c="dimmed">
          Assigned users with an email are shared automatically as readers. To see the
          calendar in Google Calendar, add it once using the calendar ID above.
        </Text>

        {opened && calendar && !data ? (
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
                <Group gap={6}>
                  {data?.assigned.map((assignedEmail) => (
                    <Badge key={assignedEmail} variant="light" color="teal">
                      {assignedEmail} · reader
                    </Badge>
                  ))}
                </Group>
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
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm" style={{ wordBreak: "break-all" }}>
                        {rule.email}
                        <Text span c="dimmed">
                          {" "}
                          · {rule.role}
                        </Text>
                      </Text>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => handleRemove(rule.email)}
                      >
                        Remove
                      </Button>
                    </Group>
                  </Paper>
                ))
              )}
            </Stack>

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
              <Button onClick={handleAdd} leftSection={<IconPlus size={16} />}>
                Add
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
