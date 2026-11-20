"use client";

import { Badge, Button, Code, Group, Paper, Stack, Table, Text } from "@mantine/core";
import { LazyModal } from "@/components/LazyModal";

import { IconPlus, IconWebhook } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { useActivityRefresh } from "@/components/ActivityBar";
import type { Webhook } from "@/db/schema";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { useIsDesktop } from "@/lib/ui/useBreakpoint";
import { useEntityEditor } from "@/lib/ui/useEntityEditor";
import { activatable } from "@/lib/ui/activatable";
import dynamic from "next/dynamic";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { useChunkReady } from "@/lib/loading/chunkReady";

// The add/edit webhook form is only mounted on tap; split it out of the
// webhooks route's initial chunk. The chunk reveal dissolves through
// `CrossfadeSwap` (gated on `useChunkReady`) instead of `dynamic`'s hard-cut
// fallback.
const loadWebhookForm = () => import("./WebhookForm").then((mod) => mod.WebhookForm);
const WebhookForm = dynamic(loadWebhookForm, { ssr: false, loading: () => null });

interface WebhookTableProps {
  webhooks: Webhook[];
}

export function WebhookTable({ webhooks }: WebhookTableProps) {
  const isDesktop = useIsDesktop();
  const editor = useEntityEditor<Webhook>();
  const webhookFormReady = useChunkReady(loadWebhookForm, editor.opened);
  const refreshAfterSave = useActivityRefresh("webhooks:save");

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
            onClick={editor.openCreate}
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
          onAction={editor.openCreate}
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
                onClick={() => editor.openEdit(webhook)}
                {...activatable(() => editor.openEdit(webhook))}
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
                    onClick={() => editor.openEdit(webhook)}
                    {...activatable(() => editor.openEdit(webhook))}
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

      <LazyModal
        opened={editor.opened}
        onClose={editor.closeEditor}
        title={editor.editing ? "Edit webhook endpoint" : "Add webhook endpoint"}
        size={isDesktop ? "md" : "sm"}
        ready={webhookFormReady}
        skeleton={<FormModalSkeleton rows={3} />}
      >
        <WebhookForm
          key={editor.editing?.id ?? "new"}
          webhook={
            editor.editing
              ? {
                  id: editor.editing.id,
                  name: editor.editing.name,
                  url: editor.editing.url,
                  secret: editor.editing.secret ?? "",
                  enabled: editor.editing.enabled,
                }
              : null
          }
          onDone={() => {
            editor.closeEditor();
            refreshAfterSave();
          }}
        />
      </LazyModal>

      {/* Mobile-only: at lg the "Add webhook" button in the toolbar replaces
          the FAB. hiddenFrom sits on the toolbar itself: its Affix portals to
          <body>, so a wrapper element could not hide it. */}
      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)" hiddenFrom="lg">
        <FloatingActionButton
          aria-label="Add webhook endpoint"
          className="c2-glass-fab--brand"
          onClick={editor.openCreate}
        >
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
