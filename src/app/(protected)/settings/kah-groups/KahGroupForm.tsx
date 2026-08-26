"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { UserSelectModal } from "@/components/UserSelectModal";
import {
  createKahGroup,
  deleteKahGroup,
  updateKahGroup,
  type KahGroupActionResult,
} from "@/lib/kah/actions";
import {
  KAH_GROUP_NAME_MAX_LENGTH,
  KAH_MEMBERS_EMPTY_ERROR,
  KAH_PERCENTAGE_MAX,
  validateKahGroupForm,
} from "@/lib/kah/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { buildUserGroups, selectionByGroup, type UserGroupInput } from "@/lib/users/userSelect";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

interface KahGroupFormProps {
  group: {
    id: string;
    name: string;
    minPercentage: number;
    memberIds: string[];
  } | null;
  /** Settings default prefilled for a new group's percentage. */
  defaultPercentage: number;
  pickerUsers: UserGroupInput[];
  onDone: () => void;
}

interface FormValues {
  name: string;
  minPercentage: number;
  memberIds: string[];
}

export function KahGroupForm({ group, defaultPercentage, pickerUsers, onDone }: KahGroupFormProps) {
  const isEdit = group !== null;
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);

  const groups = buildUserGroups(pickerUsers);

  const form = useForm<FormValues>({
    initialValues: {
      name: group?.name ?? "",
      minPercentage: group?.minPercentage ?? defaultPercentage,
      memberIds: group?.memberIds ?? [],
    },
    validate: (values) => ({
      ...validateKahGroupForm({
        name: values.name,
        minPercentage: values.minPercentage,
      }),
      ...(values.memberIds.length === 0 ? { memberIds: KAH_MEMBERS_EMPTY_ERROR } : {}),
    }),
    validateInputOnBlur: true,
  });

  const onSubmit = form.onSubmit(
    async (values) => {
      const result: KahGroupActionResult = isEdit
        ? await updateKahGroup(group.id, values)
        : await createKahGroup(values);

      if (result.ok) {
        notifications.show({
          color: "green",
          message: isEdit ? "KAH group updated" : "KAH group created",
        });
        onDone();
        return;
      }

      if (result.field === "name") {
        form.setFieldError("name", result.error);
      } else if (result.field === "minPercentage") {
        form.setFieldError("minPercentage", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  async function confirmDelete() {
    if (!group || deletingGroup) {
      return;
    }
    setDeletingGroup(true);
    try {
      const result = await deleteKahGroup(group.id);
      closeConfirm();
      if (result.ok) {
        notifications.show({ color: "green", message: "KAH group deleted" });
        onDone();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeletingGroup(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput
          label="Name"
          required
          placeholder="Command group"
          description="Label shown in this list and the audit log"
          maxLength={KAH_GROUP_NAME_MAX_LENGTH}
          {...form.getInputProps("name")}
        />
        <NumberInput
          label="Required in country (%)"
          required
          description="When an event drops this group's in-country share below this percentage during the event's window, the notification addresses are emailed."
          min={1}
          max={KAH_PERCENTAGE_MAX}
          allowNegative={false}
          {...form.getInputProps("minPercentage")}
        />

        <Stack gap={4}>
          <Group justify="space-between" wrap="nowrap">
            <Text component="label" fw={500} fz="sm">
              Members ({form.values.memberIds.length})
            </Text>
            <Button type="button" variant="light" size="compact-sm" onClick={openPicker}>
              Choose
            </Button>
          </Group>
          {form.values.memberIds.length > 0 ? (
            <Group gap={6} wrap="wrap">
              {groups.map((section) => (
                <Group key={section.label} gap={6} wrap="wrap">
                  {section.options
                    .filter((option) => form.values.memberIds.includes(option.id))
                    .map((option) => (
                      <Badge key={option.id} size="lg" variant="light" color="blue">
                        {option.label}
                      </Badge>
                    ))}
                </Group>
              ))}
            </Group>
          ) : (
            <Text c="dimmed" fz="sm">
              No members selected.
            </Text>
          )}
          {form.errors.memberIds && (
            <Text c="red" fz="sm">
              {form.errors.memberIds}
            </Text>
          )}
        </Stack>

        <Group justify="flex-end" mt="md" wrap="nowrap">
          {isEdit && (
            <Button type="button" color="red" variant="light" onClick={openConfirm}>
              Delete
            </Button>
          )}
          <Button
            type="submit"
            fullWidth={!isEdit}
            loading={form.submitting}
            loaderProps={BUTTON_LOADER_PROPS}
          >
            {isEdit ? "Save changes" : "Create group"}
          </Button>
        </Group>

        <Modal opened={confirmOpened} onClose={closeConfirm} title="Delete KAH group" centered size="sm">
          <Stack>
            <Text>
              Delete &quot;{group?.name}&quot;? Its members stay on the roster; only the group and its
              membership are removed.
            </Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeConfirm}>
                Cancel
              </Button>
              <Button
                color="red"
                loading={deletingGroup}
                loaderProps={BUTTON_LOADER_PROPS}
                onClick={confirmDelete}
              >
                Delete
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Rendered only while open so the draft re-seeds from the current
            selection every time (the FilterModalBody pattern); z-300 stacks
            above this form's modal. */}
        {pickerOpened && (
          <UserSelectModal
            opened
            onClose={closePicker}
            title="Select members"
            confirmLabel="Add members"
            groups={groups}
            zIndex={300}
            values={selectionByGroup(groups, form.values.memberIds)}
            onConfirm={(selection) => {
              form.setFieldValue("memberIds", Object.values(selection).flat());
            }}
          />
        )}
      </Stack>
    </form>
  );
}
