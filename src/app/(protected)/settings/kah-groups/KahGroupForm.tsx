"use client";

import { useState } from "react";
import {
  Button,
  NumberInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { ConfirmModal } from "@/components/ConfirmModal";
import { FormFooterActions } from "@/components/FormFooterActions";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { PickerField, type PickerBadgeItem } from "@/components/PickerField";
import { UserSelectModal } from "@/components/UserSelectModal";
import {
  createKahGroup,
  deleteKahGroup,
  updateKahGroup,
} from "@/lib/kah/actions";
import {
  KAH_GROUP_NAME_MAX_LENGTH,
  KAH_MEMBERS_EMPTY_ERROR,
  KAH_PERCENTAGE_MAX,
  validateKahGroupForm,
} from "@/lib/kah/validate";
import { buildUserGroups, selectionByGroup, type UserGroupInput } from "@/lib/users/userSelect";
import { runConfirm } from "@/lib/ui/runConfirm";
import { submitCrudForm } from "@/lib/ui/submitCrudForm";
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

  // Summary badges for the currently selected members, in section order.
  const memberItems: PickerBadgeItem[] = groups
    .flatMap((section) => section.options)
    .filter((option) => form.values.memberIds.includes(option.id))
    .map((option) => ({ key: option.id, label: option.label }));

  const onSubmit = form.onSubmit(
    submitCrudForm<FormValues, "name" | "minPercentage">({
      form,
      isEdit,
      create: createKahGroup,
      update: (values) => updateKahGroup(group!.id, values),
      success: { create: "KAH group created", update: "KAH group updated" },
      fieldMap: { name: "name", minPercentage: "minPercentage" },
      onSuccess: () => onDone(),
    }),
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  async function confirmDelete() {
    if (!group || deletingGroup) {
      return;
    }
    setDeletingGroup(true);
    try {
      await runConfirm({
        call: () => deleteKahGroup(group.id),
        onSuccess: () => {
          notifications.show({ color: "green", message: "KAH group deleted" });
          onDone();
        },
        onError: (message) => notifications.show({ color: "red", message }),
      });
      closeConfirm();
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
          <PickerField
            label="Members"
            count={form.values.memberIds.length}
            items={memberItems}
            onRemove={(item) =>
              form.setFieldValue(
                "memberIds",
                form.values.memberIds.filter((id) => id !== item.key),
              )
            }
            empty={
              <Text c="dimmed" fz="sm">
                No members selected.
              </Text>
            }
            onOpen={openPicker}
          />
          {form.errors.memberIds && (
            <Text c="red" fz="sm">
              {form.errors.memberIds}
            </Text>
          )}
        </Stack>

        <FormFooterActions
          isEdit={isEdit}
          loading={form.submitting}
          submitLabel={isEdit ? "Save changes" : "Create group"}
          fullWidthOnCreate
          secondary={
            isEdit ? (
              <Button type="button" color="red" variant="light" onClick={openConfirm}>
                Delete
              </Button>
            ) : null
          }
        />

        <ConfirmModal
          opened={confirmOpened}
          onClose={closeConfirm}
          title="Delete KAH group"
          message={
            <>
              Delete &quot;{group?.name}&quot;? Its members stay on the roster; only the group and
              its membership are removed.
            </>
          }
          loading={deletingGroup}
          onConfirm={confirmDelete}
        />

        {/* Rendered only while open so the draft re-seeds from the current
            selection every time (the FilterModalBody pattern); z-300 stacks
            above this form's modal. */}
        {pickerOpened && (
          <UserSelectModal
            opened
            onClose={closePicker}
            title="Select members"
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
