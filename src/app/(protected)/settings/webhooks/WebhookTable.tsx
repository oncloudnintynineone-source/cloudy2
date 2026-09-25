"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  useMantineTheme,
} from "@mantine/core";

import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconPlus, IconWebhook } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { useActivityRefresh } from "@/components/ActivityBar";
import type { Webhook } from "@/db/schema";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { activatable } from "@/lib/ui/activatable";
import dynamic from "next/dynamic";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";

// The add/edit webhook form is only mounted on tap; split it out of the
// webhooks route's initial chunk.
const WebhookForm = dynamic(() => import("./WebhookForm").then((mod) => mod.WebhookForm), {
  ssr: false,
  loading: () => <FormModalSkeleton rows={3} />,
});

interface WebhookTableProps {
  webhooks: Webhook[];
}

export function WebhookTable({ webhooks }: WebhookTableProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const refreshAfterSave = useActivityRefresh("webhooks:save");

  function openCreate() {
    setEditing(null);
    openForm();
  }

  function openEdit(webhook: Webhook) {
    setEditing(webhook);
    openForm();
  }

  return (
    <Stack pb="xl" className={CONTENT_ENTER_CLASS}>
      {/* Desktop: full-size create button instead of the FAB (like the
          event-types tab); rendered above the list so it is still available
          when empty. */}
      <Paper withBorder p="sm" visibleFrom="lg">
        <Group justify="flex-end" wrap="nowrap">
          <Button
            __vars={{ "--button-height": "43px" }}
            leftSection={<IconPlus size={16} />}
            onClick={openCreate}
          >
            Add webhook
          </Button>
        </Group>
      </Paper>

      {webhooks.length === 0 ? (
        <EmptyState
          icon={<IconWebhook size={18} />}
          description="No webhook endpoints yet. Every enabled endpoint is notified when an event is created, modified, or deleted."
          actionLabel="Add webhook"
          onAction={openCreate}
        />
      ) : (
        <>
          {/* Mobile: card list */}
          <Stack gap="sm" hiddenFrom="lg">
            {webhooks.map((webhook) => (
              <Paper
                key={webhook.id}
                withBorder
                p="sm"
                onClick={() => openEdit(webhook)}
                {...activatable(() => openEdit(webhook))}
                style={{ cursor: "pointer" }}
              >
                <Stack gap={0}>
                  <Text fw={600}>{webhook.name}</Text>
                  <Group gap="xs" wrap="wrap">
                    <Badge size="sm" variant="light" color={webhook.enabled ? "green" : "gray"}>
                      {webhook.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Code fz="xs">{webhook.url}</Code>
                  </Group>
                </Stack>
              </Paper>
            ))}
          </Stack>

          {/* Desktop: data table */}
          <Paper withBorder visibleFrom="lg">
            <Table withRowBorders={false} highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>URL</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {webhooks.map((webhook) => (
                  <Table.Tr
                    key={webhook.id}
                    onClick={() => openEdit(webhook)}
                    {...activatable(() => openEdit(webhook))}
                    style={{ cursor: "pointer" }}
                  >
                    <Table.Td>
                      <Text fw={600}>{webhook.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Code fz="sm">{webhook.url}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={webhook.enabled ? "green" : "gray"}>
                        {webhook.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </>
      )}

      <Modal
        opened={formOpened}
        onClose={closeForm}
        title={editing ? "Edit webhook endpoint" : "Add webhook endpoint"}
        centered
        size={isDesktop ? "md" : "sm"}
      >
        <WebhookForm
          key={editing?.id ?? "new"}
          webhook={
            editing
              ? {
                  id: editing.id,
                  name: editing.name,
                  url: editing.url,
                  secret: editing.secret ?? "",
                  enabled: editing.enabled,
                }
              : null
          }
          onDone={() => {
            closeForm();
            setEditing(null);
            refreshAfterSave();
          }}
        />
      </Modal>

      {/* Mobile-only: at lg the "Add webhook" button in the toolbar replaces
          the FAB. hiddenFrom sits on the toolbar itself: its Affix portals to
          <body>, so a wrapper element could not hide it. */}
      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)" hiddenFrom="lg">
        <FloatingActionButton
          aria-label="Add webhook endpoint"
          className="c2-glass-fab--brand"
          onClick={openCreate}
        >
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
