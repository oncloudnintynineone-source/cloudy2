"use client";

import { useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconCopy, IconPencil, IconTrash } from "@tabler/icons-react";

import { useActivityRefresh } from "@/components/ActivityBar";
import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";
import { ROW_ACTION_ICON_SIZE, ROW_ACTION_SIZE } from "@/components/reorderUpDown";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { defaultNotificationRecipe } from "@/lib/events/notifyRecipes";
import {
  deleteEventTitleTemplate,
  duplicateEventTitleTemplate,
  updateEventTitleTemplateAssignments,
  updateNameTemplate,
  type SettingsActionResult,
} from "@/lib/settings/actions";
import { formatFullName } from "@/lib/settings/formatName";
import {
  renderTitleRecipe,
  type EventTitlePerson,
  type EventTitleRecipeInput,
  type TitleRecipe,
} from "@/lib/settings/titleRecipe";
import {
  EVENT_TITLE_ASSIGNMENT_TARGETS,
  EVENT_TITLE_TARGET_LABELS,
  NAME_TEMPLATE_PLACEHOLDERS,
  type EventTitleAssignmentTarget,
  validateNameTemplate,
} from "@/lib/settings/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import dynamic from "next/dynamic";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";

// The title-recipe builder (chip rows, reorderable segments) is only mounted
// when a template dialog opens; split it out of the templates route's initial
// chunk.
const TitleRecipeBuilder = dynamic(
  () => import("./TitleRecipeBuilder").then((mod) => mod.TitleRecipeBuilder),
  { ssr: false, loading: () => <FormModalSkeleton rows={5} /> },
);

interface TemplatesManagerProps {
  nameTemplate: string;
  eventTitleRecipe: TitleRecipe;
  templates: { id: string; label: string; recipe: TitleRecipe }[];
  assignments: Record<string, string>;
  previewUsers: { name: string; shortname: string | null; departmentName: string | null }[];
  previewEventTypes: { name: string; shortname: string | null }[];
  /** Feature flag: show the drag handle beside the chevrons. */
  dragEnabled: boolean;
}

const SAMPLE_DESCRIPTION = "Team offsite";
const SAMPLE_LOCATION = "Hall A";

const FALLBACK_USERS = [
  { name: "John Lai", shortname: "JL", departmentName: "Engineering 1" },
  { name: "Mei Lin", shortname: "ML", departmentName: "Logistics" },
];

function activatable(onActivate: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

function Row({
  leading,
  title,
  preview,
  onOpen,
  onEdit,
  editLabel,
  onDuplicate,
  duplicateLabel,
  onDelete,
  deleteLabel,
  deleteLocked,
  deleteLockedLabel,
}: {
  leading?: React.ReactNode;
  title: string;
  preview: string;
  onOpen: () => void;
  onEdit: () => void;
  editLabel: string;
  onDuplicate?: () => void;
  duplicateLabel?: string;
  onDelete?: () => void;
  deleteLabel?: string;
  deleteLocked?: boolean;
  deleteLockedLabel?: string;
}) {
  return (
    <Paper withBorder radius="md" p="sm" onClick={onOpen} {...activatable(onOpen)}>
      <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
        <Group wrap="nowrap" gap="sm" align="center" style={{ minWidth: 0, flex: 1 }}>
          {leading}
          <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
            <Text size="sm" fw={600}>
              {title}
            </Text>
            <Text size="sm" c="dimmed" truncate>
              {preview || "—"}
            </Text>
          </Stack>
        </Group>
        <Group wrap="nowrap" gap={4} style={{ flexShrink: 0 }}>
          {onDuplicate && duplicateLabel && (
            <Tooltip label={duplicateLabel}>
              <ActionIcon
                variant="default"
                size={ROW_ACTION_SIZE}
                aria-label={duplicateLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  onDuplicate();
                }}
              >
                <IconCopy size={ROW_ACTION_ICON_SIZE} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={editLabel}>
            <ActionIcon
              variant="default"
              size={ROW_ACTION_SIZE}
              aria-label={editLabel}
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
            >
              <IconPencil size={ROW_ACTION_ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
          {onDelete && deleteLabel && !deleteLocked && (
            <Tooltip label={deleteLabel}>
              <ActionIcon
                variant="light"
                color="red"
                size={ROW_ACTION_SIZE}
                aria-label={deleteLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                <IconTrash size={ROW_ACTION_ICON_SIZE} />
              </ActionIcon>
            </Tooltip>
          )}
          {deleteLocked && (
            <Tooltip label={deleteLockedLabel ?? "Can't be deleted"}>
              <ActionIcon
                variant="light"
                color="gray"
                size={ROW_ACTION_SIZE}
                aria-label={deleteLockedLabel ?? "Can't be deleted"}
                disabled
              >
                <IconTrash size={ROW_ACTION_ICON_SIZE} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Paper>
  );
}

export function TemplatesManager({
  nameTemplate,
  eventTitleRecipe,
  templates,
  assignments,
  previewUsers,
  previewEventTypes,
  dragEnabled,
}: TemplatesManagerProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const refreshAfterSave = useActivityRefresh("templates:save");

  const [masterOpened, { open: openMaster, close: closeMaster }] = useDisclosure(false);
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [editing, setEditing] = useState<{
    id?: string;
    label: string;
    recipe: TitleRecipe;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [assignmentsOpened, { open: openAssignments, close: closeAssignments }] =
    useDisclosure(false);
  const [nameOpened, { open: openName, close: closeName }] = useDisclosure(false);
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const sampleUsers = (previewUsers.length > 0 ? previewUsers : FALLBACK_USERS).slice(0, 2);
  const people: EventTitlePerson[] = sampleUsers.map((user) => ({
    full: user.name,
    acronym: user.shortname || user.name,
    fqn: formatFullName({ name: user.name, departmentName: user.departmentName }, nameTemplate),
  }));
  const sampleDepartments = [
    ...new Set(
      sampleUsers
        .map((user) => user.departmentName)
        .filter((name): name is string => Boolean(name)),
    ),
  ].slice(0, 2);
  const sampleType = previewEventTypes[0] ?? { name: "Training", shortname: "TRN" };

  const sample: EventTitleRecipeInput = {
    description: SAMPLE_DESCRIPTION,
    eventType: { name: sampleType.name, acronym: sampleType.shortname || sampleType.name },
    people,
    departments: sampleDepartments,
    location: SAMPLE_LOCATION,
    timeOption: "range",
    startTime: "09:00",
    endTime: "17:00",
    startAmPm: "",
    endAmPm: "",
  };
  const emptySample: EventTitleRecipeInput = {
    description: SAMPLE_DESCRIPTION,
    eventType: null,
    people: [],
    departments: [],
    location: "",
    timeOption: "full",
    startTime: "",
    endTime: "",
    startAmPm: "",
    endAmPm: "",
  };

  const closeAndRefresh = (close: () => void) => {
    close();
    refreshAfterSave();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const result = await deleteEventTitleTemplate(deleting.id);
      if (result.ok) {
        notifications.show({ color: "green", message: "Template deleted" });
        setDeleting(null);
        refreshAfterSave();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  const openCreateFrom = (recipe: TitleRecipe, label: string) => {
    setCreating(true);
    setEditing({ recipe, label });
    openEdit();
  };

  const duplicateTemplate = async (id: string) => {
    const result = await duplicateEventTitleTemplate(id);
    if (result.ok) {
      notifications.show({ color: "green", message: "Template duplicated" });
      refreshAfterSave();
    } else {
      notifications.show({ color: "red", message: result.error });
    }
  };

  return (
    <Stack gap="md" className={CONTENT_ENTER_CLASS}>
      {/* ---- Templates (titles + notifications) ---- */}
      <Paper withBorder p="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Text fw={600}>Templates</Text>
              <Text size="sm" c="dimmed">
                How events are titled (Google + every view) and the push copy users get. A field —
                including a Text sentence — shows only when it has content, so there&apos;s never
                stray punctuation.
              </Text>
            </Stack>
            <Group gap="xs" wrap="nowrap">
              <Button
                size="compact-sm"
                variant="default"
                onClick={() => {
                  setCreating(true);
                  setEditing(null);
                  openEdit();
                }}
              >
                Add template
              </Button>
              <Button size="compact-sm" variant="default" onClick={openAssignments}>
                Assign templates
              </Button>
            </Group>
          </Group>

          <ScrollArea.Autosize mah="min(50vh, 340px)" mx="-sm" px="sm">
            <Stack gap="sm">
              <Row
                leading={
                  <Badge variant="filled" size="md">
                    Master
                  </Badge>
                }
                title="Used as every target's default"
                preview={renderTitleRecipe(sample, eventTitleRecipe)}
                onOpen={openMaster}
                onEdit={openMaster}
                editLabel="Edit master template"
                onDuplicate={() => openCreateFrom(eventTitleRecipe, "Copy of Master")}
                duplicateLabel="Duplicate master to a new template"
                deleteLocked
                deleteLockedLabel="The master template can't be deleted"
              />

              {templates.map((template) => (
                <Row
                  key={template.id}
                  title={template.label}
                  preview={renderTitleRecipe(sample, template.recipe)}
                  onOpen={() => {
                    setCreating(false);
                    setEditing(template);
                    openEdit();
                  }}
                  onEdit={() => {
                    setCreating(false);
                    setEditing(template);
                    openEdit();
                  }}
                  editLabel={`Edit ${template.label}`}
                  onDuplicate={() => void duplicateTemplate(template.id)}
                  duplicateLabel={`Duplicate ${template.label}`}
                  onDelete={() => setDeleting({ id: template.id, label: template.label })}
                  deleteLabel={`Delete ${template.label}`}
                />
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Paper>

      {/* ---- Display names ---- */}
      <Paper withBorder p="sm">
        <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600}>Display names</Text>
            <Text size="sm" c="dimmed">
              How full names are composed from a user&apos;s name and department.
            </Text>
            <Text size="sm" style={{ overflowWrap: "anywhere" }}>
              {sampleUsers
                .map((user) =>
                  formatFullName(
                    { name: user.name, departmentName: user.departmentName },
                    nameTemplate,
                  ),
                )
                .join(" · ") || "—"}
            </Text>
          </Stack>
          <Tooltip label="Edit display-name template">
            <ActionIcon
              variant="default"
              size={ROW_ACTION_SIZE}
              aria-label="Edit display-name template"
              onClick={openName}
            >
              <IconPencil size={ROW_ACTION_ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Paper>

      {/* Master */}
      <Modal
        opened={masterOpened}
        onClose={closeMaster}
        title="Master event title"
        centered
        size={isDesktop ? "md" : "sm"}
      >
        <TitleRecipeBuilder
          mode="master"
          recipe={eventTitleRecipe}
          sample={sample}
          emptySample={emptySample}
          dragEnabled={dragEnabled}
          onDone={() => closeAndRefresh(closeMaster)}
        />
      </Modal>

      {/* Add / edit library template */}
      <Modal
        opened={editOpened}
        onClose={closeEdit}
        title={creating ? "Add template" : editing ? `Edit ${editing.label}` : "Template"}
        centered
        size={isDesktop ? "md" : "sm"}
      >
        <TitleRecipeBuilder
          key={creating ? "create" : (editing?.id ?? "edit")}
          mode={creating ? "create" : "edit"}
          templateId={editing?.id}
          label={editing?.label ?? ""}
          recipe={editing?.recipe ?? { segments: [{ field: "description" }] }}
          sample={sample}
          emptySample={emptySample}
          dragEnabled={dragEnabled}
          onDone={() => closeAndRefresh(closeEdit)}
        />
      </Modal>

      {/* Assignments */}
      <AssignmentsDialog
        key={JSON.stringify(assignments)}
        opened={assignmentsOpened}
        onClose={closeAssignments}
        assignments={assignments}
        templates={templates}
        masterRecipe={eventTitleRecipe}
        sample={sample}
        isDesktop={isDesktop}
        onSaved={() => closeAndRefresh(closeAssignments)}
      />

      {/* Name template */}
      <NameTemplateDialog
        opened={nameOpened}
        onClose={closeName}
        nameTemplate={nameTemplate}
        previewUsers={sampleUsers}
        onSaved={() => closeAndRefresh(closeName)}
      />

      {/* Delete confirm */}
      <Modal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete template"
        centered
        size="sm"
      >
        <Stack>
          <Text>Delete &ldquo;{deleting?.label}&rdquo;? Events already saved are untouched.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteBusy}
              loaderProps={BUTTON_LOADER_PROPS}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function AssignmentsDialog({
  opened,
  onClose,
  assignments,
  templates,
  masterRecipe,
  sample,
  isDesktop,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  assignments: Record<string, string>;
  templates: { id: string; label: string; recipe: TitleRecipe }[];
  masterRecipe: TitleRecipe;
  sample: EventTitleRecipeInput;
  isDesktop: boolean;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      EVENT_TITLE_ASSIGNMENT_TARGETS.map((target) => [target, assignments[target] ?? ""]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const templateOptions = [
    { value: "", label: "Default" },
    ...templates.map((t) => ({ value: t.id, label: t.label })),
  ];
  const recipeMap = new Map(templates.map((t) => [t.id, t.recipe]));

  const isNotify = (target: EventTitleAssignmentTarget): boolean =>
    target === "notifyCreated" || target === "notifyAdded";
  const defaultFor = (target: EventTitleAssignmentTarget): TitleRecipe =>
    isNotify(target)
      ? defaultNotificationRecipe(target === "notifyCreated" ? "created" : "added")
      : masterRecipe;

  const save = async () => {
    setBusy(true);
    try {
      const cleaned: Record<string, string | null> = {};
      for (const target of EVENT_TITLE_ASSIGNMENT_TARGETS) {
        cleaned[target] = values[target] || null;
      }
      const result = await updateEventTitleTemplateAssignments(
        cleaned as Record<string, string | null>,
      );
      if (result.ok) {
        notifications.show({ color: "green", message: "Assignments updated" });
        onSaved();
        return;
      }
      notifications.show({ color: "red", message: result.error });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Assign templates to targets"
      centered
      size={isDesktop ? "md" : "sm"}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Each calendar view, the pinned ticker, and the Double Booking report use the assigned
          template, or Master when empty. Notifications fall back to their built-in copy when empty.
        </Text>
        <ScrollArea.Autosize mah="min(60vh, 420px)" mx="-sm" px="sm">
          <Stack gap="sm">
            {EVENT_TITLE_ASSIGNMENT_TARGETS.map((target) => {
              const id = values[target] ?? "";
              const recipe = id ? (recipeMap.get(id) ?? defaultFor(target)) : defaultFor(target);
              const placeholder = isNotify(target) ? "Default copy" : "Master (Default)";
              return (
                <Stack key={target} gap={4}>
                  <NoKeyboardSelect
                    label={EVENT_TITLE_TARGET_LABELS[target]}
                    data={templateOptions}
                    value={id}
                    onChange={(value) =>
                      setValues((current) => ({ ...current, [target]: value ?? "" }))
                    }
                    placeholder={placeholder}
                    searchable={false}
                    allowDeselect
                    clearable
                  />
                  <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                    Preview: {renderTitleRecipe(sample, recipe) || "—"}
                  </Text>
                </Stack>
              );
            })}
          </Stack>
        </ScrollArea.Autosize>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} loaderProps={BUTTON_LOADER_PROPS} onClick={() => void save()}>
            Save assignments
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function NameTemplateDialog({
  opened,
  onClose,
  nameTemplate,
  previewUsers,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  nameTemplate: string;
  previewUsers: { name: string; shortname: string | null; departmentName: string | null }[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(nameTemplate);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const insert = (token: string) => {
    setDraft((current) => {
      const input = inputRef.current;
      if (!input) return current + token;
      const start = input.selectionStart ?? current.length;
      const end = input.selectionEnd ?? current.length;
      const next = current.slice(0, start) + token + current.slice(end);
      requestAnimationFrame(() => {
        input.focus();
        const pos = start + token.length;
        input.setSelectionRange(pos, pos);
      });
      return next;
    });
  };

  const save = async () => {
    const errors = validateNameTemplate({ nameTemplate: draft });
    if (errors.nameTemplate) {
      setError(errors.nameTemplate);
      return;
    }
    setBusy(true);
    try {
      const result: SettingsActionResult = await updateNameTemplate(draft);
      if (result.ok) {
        notifications.show({ color: "green", message: "Name template updated" });
        onSaved();
        return;
      }
      notifications.show({ color: "red", message: result.error });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Display name template" centered size="sm">
      <Stack>
        <Text size="sm" c="dimmed">
          Compose fully qualified names from a user&apos;s name and department.
        </Text>
        <Textarea
          ref={inputRef}
          label="Template"
          value={draft}
          error={error ?? undefined}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            if (error) setError(null);
          }}
          autosize
          minRows={2}
          maxRows={5}
        />
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            Insert:
          </Text>
          {NAME_TEMPLATE_PLACEHOLDERS.map((token) => (
            <Button
              key={token}
              type="button"
              size="compact-xs"
              variant="default"
              onClick={() => insert(token)}
            >
              {token}
            </Button>
          ))}
        </Group>
        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            Preview:
          </Text>
          {previewUsers.map((user) => (
            <Text key={user.name} size="sm" c="dimmed">
              {user.name} →{" "}
              {formatFullName({ name: user.name, departmentName: user.departmentName }, draft) ||
                "—"}
            </Text>
          ))}
        </Stack>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} loaderProps={BUTTON_LOADER_PROPS} onClick={() => void save()}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
