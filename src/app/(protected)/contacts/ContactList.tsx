"use client";

import { useMemo, useState } from "react";
import { ActionIcon, Anchor, Badge, Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { IconCheck, IconCopy, IconPhone } from "@tabler/icons-react";

import type { RosterUser } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";

interface ContactListProps {
  users: RosterUser[];
  nameTemplate: string;
}

interface CopyPhoneButtonProps {
  phone: string;
  name: string;
}

function CopyPhoneButton({ phone, name }: CopyPhoneButtonProps) {
  const clipboard = useClipboard();
  return (
    <ActionIcon
      size="lg"
      variant={clipboard.copied ? "filled" : "light"}
      color={clipboard.copied ? "teal" : "brand"}
      onClick={() => clipboard.copy(phone)}
      aria-label={`Copy ${name}'s phone number`}
    >
      {clipboard.copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
    </ActionIcon>
  );
}

export function ContactList({ users, nameTemplate }: ContactListProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return users;
    }
    return users.filter(
      (user) => user.name.toLowerCase().includes(query) || user.phone.includes(query),
    );
  }, [users, search]);

  return (
    <Stack pb="xl">
      <Paper withBorder p="sm">
        <TextInput
          placeholder="Search by name or phone"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </Paper>

      {filtered.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">
          No contacts found.
        </Text>
      ) : (
        <Stack gap="sm">
          {filtered.map((user) => (
            <Paper key={user.id} withBorder p="sm">
              <Stack gap={0}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={0}>
                    <Text fw={600}>{user.name}</Text>
                    <Text size="sm" c="dimmed">
                      {formatFullName(
                        { name: user.name, departmentName: user.department?.name ?? null },
                        nameTemplate,
                      )}
                    </Text>
                  </Stack>
                  <Group gap={6} wrap="nowrap">
                    <CopyPhoneButton phone={user.phone} name={user.name} />
                    <Anchor
                      href={`tel:${user.phone}`}
                      underline="never"
                      c="brand"
                      aria-label={`Call ${user.name}`}
                    >
                      <ActionIcon size="lg" variant="filled" color="brand" component="span">
                        <IconPhone size={18} />
                      </ActionIcon>
                    </Anchor>
                  </Group>
                </Group>
                <Group gap={6} wrap="wrap" mt={4}>
                  <Text size="sm" c="dimmed">
                    {user.phone}
                  </Text>
                  <Badge color={user.role === "admin" ? "brand" : "gray"}>{user.role}</Badge>
                  {user.department ? (
                    <Badge variant="light" color="accent">
                      {user.department.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" color="gray">
                      No department
                    </Badge>
                  )}
                </Group>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
