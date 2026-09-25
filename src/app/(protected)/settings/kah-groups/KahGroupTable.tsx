"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconPlus, IconUsersGroup } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import type { KahGroupWithMembers } from "@/lib/kah/queries";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import type { UserGroupInput } from "@/lib/users/userSelect";
import { activatable } from "@/lib/ui/activatable";
import { updateKahNotifications, type SettingsActionResult } from "@/lib/settings/actions";
import { renderKahEmailTemplate, KAH_TEMPLATE_SAMPLE_CONTEXT } from "@/lib/kah/email";
import {
  KAH_EMAIL_BODY_TEMPLATE_DEFAULT,
  KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
} from "@/lib/kah/emailDefaults";
import {
  KAH_EMAIL_TEMPLATE_PLACEHOLDERS,
  validateKahNotificationsForm,
  type KahNotificationsFormValues,
} from "@/lib/kah/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";
import dynamic from "next/dynamic";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";

// The add/edit KAH group form is only mounted on tap; split it out of the
// kah-groups route's initial chunk.
const KahGroupForm = dynamic(() => import("./KahGroupForm").then((mod) => mod.KahGroupForm), {
  ssr: false,
  loading: () => <FormModalSkeleton rows={4} />,
});
import { useActivityRefresh } from "@/components/ActivityBar";

interface KahGroupTableProps {
  groups: KahGroupWithMembers[];
  pickerUsers: UserGroupInput[];
  /** Settings default prefilled when creating a new group. */
  defaultPercentage: number;
  kahEmailSubjectTemplate: string;
  kahEmailBodyTemplate: string;
}

export function KahGroupTable({
  groups,
  pickerUsers,
  defaultPercentage,
  kahEmailSubjectTemplate,
  kahEmailBodyTemplate,
}: KahGroupTableProps) {
  const refreshAfterSave = useActivityRefresh("kah:save");
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editing, setEditing] = useState<KahGroupWithMembers | null>(null);

  const kahForm = useForm<KahNotificationsFormValues>({
    initialValues: {
      subjectTemplate: kahEmailSubjectTemplate || KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
      bodyTemplate: kahEmailBodyTemplate || KAH_EMAIL_BODY_TEMPLATE_DEFAULT,
    },
    validate: (values) => validateKahNotificationsForm(values),
    validateInputOnBlur: true,
  });

  const preview = useMemo(
    () => ({
      subject: renderKahEmailTemplate(kahForm.values.subjectTemplate, KAH_TEMPLATE_SAMPLE_CONTEXT),
      body: renderKahEmailTemplate(kahForm.values.bodyTemplate, KAH_TEMPLATE_SAMPLE_CONTEXT),
    }),
    [kahForm.values.subjectTemplate, kahForm.values.bodyTemplate],
  );

  const onSubmitKah = kahForm.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateKahNotifications(values);

      if (result.ok) {
        notifications.show({ color: "green", message: "KAH breach email templates updated" });
        refreshAfterSave();
        return;
      }

      if (result.field === "kahSubject") {
        kahForm.setFieldError("subjectTemplate", result.error);
      } else if (result.field === "kahBody") {
        kahForm.setFieldError("bodyTemplate", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => kahForm.getInputNode(field)),
  );

  function openCreate() {
    setEditing(null);
    openForm();
  }

  function openEdit(group: KahGroupWithMembers) {
    setEditing(group);
    openForm();
  }

  return (
    <Stack pb="xl" className={CONTENT_ENTER_CLASS}>
      {/* Desktop: full-size create button instead of the FAB (like the
          webhooks tab); rendered above the list so it is still available
          when empty. */}
      <Paper withBorder p="sm" visibleFrom="lg">
        <Group justify="flex-end" wrap="nowrap">
          <Button
            __vars={{ "--button-height": "43px" }}
            leftSection={<IconPlus size={16} />}
            onClick={openCreate}
          >
            Add group
          </Button>
        </Group>
      </Paper>

      {groups.length === 0 ? (
        <EmptyState
          icon={<IconUsersGroup size={18} />}
          description="No KAH groups yet. When an event pushes a group below its required in-country percentage, group members with email addresses are notified."
          actionLabel="Add group"
          onAction={openCreate}
        />
      ) : (
        <>
          {/* Mobile: card list */}
          <Stack gap="sm" hiddenFrom="lg">
            {groups.map((group) => (
              <Paper
                key={group.id}
                withBorder
                p="sm"
                onClick={() => openEdit(group)}
                {...activatable(() => openEdit(group))}
                style={{ cursor: "pointer" }}
              >
                <Stack gap={4}>
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw={600}>{group.name}</Text>
                    <Badge size="sm" variant="light" color="blue">
                      {group.minPercentage}% in country
                    </Badge>
                  </Group>
                  <Text fz="sm" c="dimmed" lineClamp={2}>
                    {group.members.length > 0
                      ? group.members.map((member) => member.name).join(", ")
                      : "No members"}
                  </Text>
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
                  <Table.Th>Required in country</Table.Th>
                  <Table.Th>Members</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {groups.map((group) => (
                  <Table.Tr
                    key={group.id}
                    onClick={() => openEdit(group)}
                    {...activatable(() => openEdit(group))}
                    style={{ cursor: "pointer" }}
                  >
                    <Table.Td>
                      <Text fw={600}>{group.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color="blue">
                        {group.minPercentage}%
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" c={group.members.length > 0 ? undefined : "dimmed"}>
                        {group.members.length > 0
                          ? `${group.members.length}: ${group.members
                              .map((member) => member.name)
                              .join(", ")}`
                          : "No members"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </>
      )}

      {/* Breach email templates */}
      <Paper withBorder p="sm">
        <form onSubmit={onSubmitKah}>
          <Stack gap="sm">
            <Text fw={600}>Breach Email Templates</Text>
            <Text fz="sm" c="dimmed">
              When an event pushes a KAH group below its required in-country percentage, all group
              members with an email address on their profile are notified using these templates.
            </Text>

            <TextInput
              label="Subject Template"
              description={`Tokens: ${KAH_EMAIL_TEMPLATE_PLACEHOLDERS.join(" ")}`}
              {...kahForm.getInputProps("subjectTemplate")}
            />

            <Textarea
              label="Body Template"
              description="{breaches} renders the per-group summary lines and is required."
              autosize
              minRows={8}
              maxRows={16}
              styles={{
                input: {
                  fontFamily: "var(--mantine-font-family-monospace)",
                  fontSize: "var(--mantine-font-size-sm)",
                },
              }}
              {...kahForm.getInputProps("bodyTemplate")}
            />

            <Paper withBorder p="sm" variant="filled">
              <Text fz="xs" fw={700} c="dimmed" mb={4}>
                Preview (sample data)
              </Text>
              <Box style={{ whiteSpace: "pre-wrap" }}>
                <Text fz="sm" fw={600}>
                  {preview.subject}
                </Text>
                <Text fz="sm" mt={4}>
                  {preview.body}
                </Text>
              </Box>
            </Paper>

            <Group justify="flex-end">
              <Button type="submit" loading={kahForm.submitting} loaderProps={BUTTON_LOADER_PROPS}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>

      <Modal
        opened={formOpened}
        onClose={closeForm}
        title={editing ? "Edit KAH group" : "Add KAH group"}
        centered
        size={isDesktop ? "md" : "sm"}
      >
        <KahGroupForm
          key={editing?.id ?? "new"}
          group={
            editing
              ? {
                  id: editing.id,
                  name: editing.name,
                  minPercentage: editing.minPercentage,
                  memberIds: editing.members.map((member) => member.id),
                }
              : null
          }
          defaultPercentage={defaultPercentage}
          pickerUsers={pickerUsers}
          onDone={() => {
            closeForm();
            setEditing(null);
            refreshAfterSave();
          }}
        />
      </Modal>

      {/* Mobile-only: at lg the "Add group" button in the toolbar replaces
          the FAB. hiddenFrom sits on the toolbar itself: its Affix portals to
          <body>, so a wrapper element could not hide it. */}
      <FloatingToolbar bottomOffset="var(--settings-fab-bottom)" hiddenFrom="lg">
        <FloatingActionButton
          aria-label="Add KAH group"
          className="c2-glass-fab--brand"
          onClick={openCreate}
        >
          <IconPlus size={FAB_ICON_SIZE} />
        </FloatingActionButton>
      </FloatingToolbar>
    </Stack>
  );
}
