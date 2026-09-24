"use client";

import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAlignLeft,
  IconBuildingCommunity,
  IconClock,
  IconMapPin,
  IconNotes,
  IconPencil,
  IconPlus,
  IconTag,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";

import {
  createEventTitleTemplate,
  deleteEventTitleTemplate,
  duplicateEventTitleTemplate,
  updateEventTitleRecipe,
  updateEventTitleTemplateById,
  type SettingsActionResult,
} from "@/lib/settings/actions";
import {
  renderTitleRecipe,
  TITLE_FIELD_LABELS,
  TITLE_RECIPE_CONNECTORS,
  TITLE_RECIPE_FIELDS,
  TITLE_RECIPE_MAX_SEGMENTS,
  type EventTitleRecipeInput,
  type TitlePeopleStyle,
  type TitleRecipe,
  type TitleRecipeConnector,
  type TitleRecipeField,
  type TitleRecipeWrapper,
  type TitleTypeStyle,
} from "@/lib/settings/titleRecipe";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { moveToIndex, swapAdjacent, useReorderRows } from "@/lib/ui/reorderRows";
import { SortableList, SortableRow } from "@/components/SortableRow";
import { ROW_ACTION_ICON_SIZE, ROW_ACTION_SIZE, ReorderUpDown } from "@/components/reorderUpDown";

interface TitleRecipeBuilderProps {
  mode: "master" | "create" | "edit";
  templateId?: string;
  label?: string;
  recipe: TitleRecipe;
  sample: EventTitleRecipeInput;
  emptySample: EventTitleRecipeInput;
  /** Feature flag: show the drag handle beside the chevrons. */
  dragEnabled: boolean;
  onDone: () => void;
}

interface Row {
  key: number;
  field: TitleRecipeField;
  typeStyle?: TitleTypeStyle;
  peopleStyle?: TitlePeopleStyle;
  text?: string;
  wrapper: TitleRecipeWrapper;
  connector: TitleRecipeConnector;
}

const FIELD_ICONS: Record<TitleRecipeField, React.ReactNode> = {
  type: <IconTag size={16} />,
  description: <IconAlignLeft size={16} />,
  people: <IconUsers size={16} />,
  departments: <IconBuildingCommunity size={16} />,
  location: <IconMapPin size={16} />,
  time: <IconClock size={16} />,
  text: <IconNotes size={16} />,
};

const CONNECTOR_LABELS: Record<TitleRecipeConnector, string> = {
  none: "None",
  space: "Space",
  comma: "Comma (,)",
  dash: "Dash (–)",
  colon: "Colon (:)",
  middot: "Dot (·)",
};

const STYLE_LABELS: Partial<Record<TitleRecipeField, Record<string, string>>> = {
  type: { name: "Name", acronym: "Acronym" },
  people: {
    fqn: "Full + dept",
    full: "Name",
    acronym: "Acronym",
  },
};

function defaultStyles(field: TitleRecipeField): Pick<Row, "typeStyle" | "peopleStyle"> {
  if (field === "type") return { typeStyle: "acronym", peopleStyle: undefined };
  if (field === "people") return { peopleStyle: "fqn", typeStyle: undefined };
  return { typeStyle: undefined, peopleStyle: undefined };
}

function toRows(recipe: TitleRecipe): Row[] {
  return recipe.segments.map((segment, index) => ({
    key: index,
    field: segment.field,
    typeStyle: segment.typeStyle,
    peopleStyle: segment.peopleStyle,
    text: segment.text,
    wrapper: segment.wrapper ?? "none",
    connector: segment.connector ?? "none",
  }));
}

function toRecipe(rows: Row[]): TitleRecipe {
  return {
    segments: rows.map((row) => ({
      field: row.field,
      typeStyle: row.field === "type" ? row.typeStyle : undefined,
      peopleStyle: row.field === "people" ? row.peopleStyle : undefined,
      text: row.field === "text" ? row.text : undefined,
      wrapper: row.wrapper === "none" ? undefined : row.wrapper,
      connector: row.connector === "none" ? undefined : row.connector,
    })),
  };
}

function rowSummary(row: Row): string {
  const field = TITLE_FIELD_LABELS[row.field];
  if (row.field === "text") {
    const text = (row.text ?? "").trim();
    return text ? `Text · “${text.length > 18 ? `${text.slice(0, 18)}…` : text}”` : "Text · …";
  }
  const style =
    (row.field === "type" || row.field === "people") && row[`${row.field}Style`]
      ? STYLE_LABELS[row.field]?.[row[`${row.field}Style`] as string]
      : undefined;
  const wrap = row.wrapper === "none" ? "" : row.wrapper === "paren" ? " (…)" : " […]";
  return style ? `${field} · ${style}${wrap}` : `${field}${wrap}`;
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <Group gap={6} wrap="wrap">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="compact-xs"
          variant={value === option.value ? "filled" : "default"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </Group>
  );
}

function FieldPicker({ onPick }: { onPick: (field: TitleRecipeField) => void }) {
  return (
    <Stack gap={6}>
      {TITLE_RECIPE_FIELDS.map((field) => (
        <UnstyledRow
          key={field}
          icon={FIELD_ICONS[field]}
          title={TITLE_FIELD_LABELS[field]}
          onActivate={() => onPick(field)}
        />
      ))}
    </Stack>
  );
}

function UnstyledRow({
  icon,
  title,
  subtitle,
  onActivate,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onActivate: () => void;
}) {
  return (
    <Paper
      withBorder
      radius="md"
      p="xs"
      component="button"
      type="button"
      w="100%"
      style={{ cursor: "pointer", textAlign: "left" }}
      onClick={onActivate}
    >
      <Group wrap="nowrap" gap="sm">
        {icon}
        <Text size="sm" fw={600} style={{ flex: 1 }}>
          {title}
        </Text>
        {subtitle && (
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        )}
      </Group>
    </Paper>
  );
}

export function TitleRecipeBuilder({
  mode,
  templateId,
  label: initialLabel,
  recipe: initialRecipe,
  sample,
  emptySample,
  dragEnabled,
  onDone,
}: TitleRecipeBuilderProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);

  const [label, setLabel] = useState(initialLabel ?? "");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [nextKey, setNextKey] = useState(initialRecipe.segments.length);
  const [rows, setRows] = useState<Row[]>(() => toRows(initialRecipe));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const {
    displayRows,
    containerRef,
    snapshot,
    play,
    move: reorderRow,
    moveTo,
  } = useReorderRows({
    rows,
    keyOf: (row) => String(row.key),
    predict: (current, id, delta) => swapAdjacent(current, (row) => String(row.key), id, delta),
    predictMove: (current, id, toIndex) =>
      moveToIndex(current, (row) => String(row.key), id, toIndex),
    onApply: setRows,
  });

  const setRow = (index: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const move = (index: number, delta: -1 | 1) => {
    const row = rows[index];
    if (!row) {
      return;
    }
    void reorderRow(String(row.key), delta);
  };

  const remove = (index: number) => {
    if (rows.length <= 1) {
      return;
    }
    snapshot();
    setRows((current) => current.filter((_, i) => i !== index));
    requestAnimationFrame(() => requestAnimationFrame(play));
  };

  const addField = (field: TitleRecipeField) => {
    const key = nextKey;
    setNextKey((current) => current + 1);
    setRows((current) =>
      current.length >= TITLE_RECIPE_MAX_SEGMENTS
        ? current
        : [
            ...current,
            {
              key,
              field,
              ...defaultStyles(field),
              text: field === "text" ? "" : undefined,
              wrapper: "none",
              connector: current.length === 0 ? "none" : "space",
            },
          ],
    );
    setPickerOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(play));
  };

  const recipe = toRecipe(rows);
  const preview = renderTitleRecipe(sample, recipe);
  const emptyPreview = renderTitleRecipe(emptySample, recipe);

  const save = async () => {
    setSaving(true);
    try {
      const result: SettingsActionResult =
        mode === "master"
          ? await updateEventTitleRecipe(recipe)
          : mode === "edit"
            ? await updateEventTitleTemplateById(templateId!, label.trim(), recipe)
            : await createEventTitleTemplate(label.trim(), recipe);
      if (result.ok) {
        notifications.show({ color: "green", message: "Template saved" });
        onDone();
        return;
      }
      if (result.field === "recipe") {
        notifications.show({ color: "red", message: result.error });
      } else {
        setLabelError(result.field === "templateLabel" ? result.error : null);
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!templateId) return;
    setDeleting(true);
    try {
      const result = await deleteEventTitleTemplate(templateId);
      if (result.ok) {
        notifications.show({ color: "green", message: "Template deleted" });
        onDone();
        return;
      }
      notifications.show({ color: "red", message: result.error });
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async () => {
    if (!templateId) return;
    setDuplicating(true);
    try {
      const result = await duplicateEventTitleTemplate(templateId);
      if (result.ok) {
        notifications.show({ color: "green", message: "Template duplicated" });
        onDone();
        return;
      }
      notifications.show({ color: "red", message: result.error });
    } finally {
      setDuplicating(false);
    }
  };

  const editingRow = editingIndex !== null ? rows[editingIndex] : null;

  return (
    <Stack gap="sm" ref={containerRef}>
      {mode !== "master" && (
        <TextInput
          label="Name"
          description="Used in dropdowns and assignment lists."
          placeholder="e.g. Compact"
          value={label}
          error={labelError ?? undefined}
          onChange={(event) => {
            setLabel(event.currentTarget.value);
            if (labelError) setLabelError(null);
          }}
        />
      )}

      <SortableList
        keys={displayRows.map((row) => String(row.key))}
        onMove={(id, toIndex) => void moveTo(id, toIndex)}
      >
        <Stack gap={6} data-flip-container>
          {displayRows.map((row, index) => (
            <SortableRow
              key={row.key}
              id={String(row.key)}
              index={index}
              name={rowSummary(row)}
              enabled={dragEnabled}
            >
              {({ ref, handle }) => (
                <Paper ref={ref} withBorder radius="md" p="xs" data-flip-id={row.key}>
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <Group wrap="nowrap" gap="xs" align="center" style={{ minWidth: 0, flex: 1 }}>
                      <Group gap={4} wrap="nowrap">
                        {handle}
                        <ReorderUpDown
                          name={rowSummary(row)}
                          upDisabled={index === 0}
                          downDisabled={index === rows.length - 1}
                          onUp={() => move(index, -1)}
                          onDown={() => move(index, 1)}
                        />
                      </Group>
                      <Badge
                        variant="light"
                        size="md"
                        leftSection={FIELD_ICONS[row.field]}
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {rowSummary(row)}
                      </Badge>
                      <Text size="xs" c="dimmed" truncate style={{ flexShrink: 0 }}>
                        {index === 0
                          ? "first"
                          : `${CONNECTOR_LABELS[row.connector].toLowerCase()} before`}
                      </Text>
                    </Group>
                    <Group wrap="nowrap" gap={4} style={{ flexShrink: 0 }}>
                      <Tooltip label="Options" position="top">
                        <ActionIcon
                          variant="default"
                          size={ROW_ACTION_SIZE}
                          aria-label={`Edit ${rowSummary(row)}`}
                          onClick={() => setEditingIndex(index)}
                        >
                          <IconPencil size={ROW_ACTION_ICON_SIZE} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={rows.length <= 1 ? "At least one field" : "Remove"}>
                        <ActionIcon
                          variant="light"
                          color="red"
                          size={ROW_ACTION_SIZE}
                          aria-label={`Remove ${rowSummary(row)}`}
                          disabled={rows.length <= 1}
                          onClick={() => remove(index)}
                        >
                          <IconTrash size={ROW_ACTION_ICON_SIZE} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                </Paper>
              )}
            </SortableRow>
          ))}
        </Stack>
      </SortableList>

      <Group>
        <Button
          type="button"
          size="xs"
          variant="default"
          leftSection={<IconPlus size={15} />}
          disabled={rows.length >= TITLE_RECIPE_MAX_SEGMENTS}
          onClick={() => setPickerOpen(true)}
        >
          Add field
        </Button>
        {rows.length >= TITLE_RECIPE_MAX_SEGMENTS && (
          <Text size="xs" c="dimmed">
            At most {TITLE_RECIPE_MAX_SEGMENTS} fields.
          </Text>
        )}
      </Group>

      <Divider />

      <Paper withBorder p="sm" variant="filled">
        <Text fz="xs" fw={700} c="dimmed" mb={4}>
          Preview — event with all details
        </Text>
        <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
          {preview || "—"}
        </Text>
        <Text size="xs" c="dimmed" mt={6}>
          When the optional fields are empty:
        </Text>
        <Text size="sm" c="dimmed" style={{ overflowWrap: "anywhere" }}>
          {emptyPreview || "—"}
        </Text>
      </Paper>

      <Group justify={mode === "edit" ? "space-between" : "flex-end"} mt="xs">
        {mode === "edit" && (
          <Group gap="xs">
            {!confirmDelete && (
              <Button
                variant="default"
                size="xs"
                loading={duplicating}
                loaderProps={BUTTON_LOADER_PROPS}
                onClick={() => void handleDuplicate()}
              >
                Duplicate
              </Button>
            )}
            {!confirmDelete && (
              <Button color="red" variant="light" size="xs" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            {confirmDelete && (
              <Group gap="xs">
                <Text size="xs" c="red">
                  Delete this template?
                </Text>
                <Button size="xs" variant="default" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button
                  size="xs"
                  color="red"
                  loading={deleting}
                  loaderProps={BUTTON_LOADER_PROPS}
                  onClick={handleDelete}
                >
                  Confirm delete
                </Button>
              </Group>
            )}
          </Group>
        )}
        <Button loading={saving} loaderProps={BUTTON_LOADER_PROPS} onClick={() => void save()}>
          {mode === "create" ? "Create" : "Save"}
        </Button>
      </Group>

      <Modal
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add a field"
        centered
        size={isDesktop ? "sm" : "xs"}
      >
        <ScrollArea.Autosize mah="min(60vh, 420px)" mx="-sm" px="sm">
          <Stack gap={6}>
            <Text size="sm" c="dimmed">
              Pick what this template shows. A field only appears when the event has content for it.
            </Text>
            <FieldPicker
              onPick={(field) => {
                setPickerOpen(false);
                addField(field);
              }}
            />
          </Stack>
        </ScrollArea.Autosize>
      </Modal>

      <Modal
        opened={editingIndex !== null}
        onClose={() => setEditingIndex(null)}
        title={editingRow ? rowSummary(editingRow) : "Field options"}
        centered
        size={isDesktop ? "sm" : "xs"}
      >
        {editingRow && (
          <SegmentOptions
            row={editingRow}
            onSave={(patch) => {
              setRow(editingIndex!, patch);
              setEditingIndex(null);
            }}
          />
        )}
      </Modal>
    </Stack>
  );
}

function SegmentOptions({ row, onSave }: { row: Row; onSave: (patch: Partial<Row>) => void }) {
  const [field, setField] = useState<TitleRecipeField>(row.field);
  const [typeStyle, setTypeStyle] = useState<TitleTypeStyle | undefined>(row.typeStyle);
  const [peopleStyle, setPeopleStyle] = useState<TitlePeopleStyle | undefined>(row.peopleStyle);
  const [text, setText] = useState(row.text ?? "");
  const [wrapper, setWrapper] = useState<TitleRecipeWrapper>(row.wrapper);
  const [connector, setConnector] = useState<TitleRecipeConnector>(row.connector);

  const applyField = (next: TitleRecipeField) => {
    setField(next);
    const styles = defaultStyles(next);
    setTypeStyle(styles.typeStyle);
    setPeopleStyle(styles.peopleStyle);
    if (next !== "text") {
      setText("");
    }
  };

  return (
    <Stack>
      <Text fz="xs" fw={700} c="dimmed" tt="uppercase">
        Field
      </Text>
      <ScrollArea.Autosize mah={240} mx="-sm" px="sm">
        <FieldPicker onPick={applyField} />
      </ScrollArea.Autosize>

      {field === "text" && (
        <>
          <Text fz="xs" fw={700} c="dimmed" tt="uppercase">
            Text
          </Text>
          <TextInput
            label="Words to show"
            description="Shown verbatim whenever this segment is present. A blank text hides the segment."
            value={text}
            maxLength={120}
            onChange={(event) => setText(event.currentTarget.value)}
          />
        </>
      )}

      {field === "type" && (
        <>
          <Text fz="xs" fw={700} c="dimmed" tt="uppercase">
            Type style
          </Text>
          <ChipGroup<TitleTypeStyle>
            options={[
              { value: "name", label: "Name" },
              { value: "acronym", label: "Acronym" },
            ]}
            value={typeStyle ?? "name"}
            onChange={setTypeStyle}
          />
        </>
      )}

      {field === "people" && (
        <>
          <Text fz="xs" fw={700} c="dimmed" tt="uppercase">
            People style
          </Text>
          <ChipGroup<TitlePeopleStyle>
            options={[
              { value: "fqn", label: "Full + department" },
              { value: "full", label: "Name" },
              { value: "acronym", label: "Acronym" },
            ]}
            value={peopleStyle ?? "fqn"}
            onChange={setPeopleStyle}
          />
        </>
      )}

      <Text fz="xs" fw={700} c="dimmed" tt="uppercase">
        Brackets
      </Text>
      <ChipGroup<TitleRecipeWrapper>
        options={[
          { value: "none", label: "None" },
          { value: "paren", label: "( … )" },
          { value: "bracket", label: "[ … ]" },
        ]}
        value={wrapper}
        onChange={setWrapper}
      />

      <Text fz="xs" fw={700} c="dimmed" tt="uppercase">
        Join to the next field
      </Text>
      <ChipGroup<TitleRecipeConnector>
        options={TITLE_RECIPE_CONNECTORS.map((value) => ({
          value,
          label: CONNECTOR_LABELS[value],
        }))}
        value={connector}
        onChange={setConnector}
      />

      <Group justify="flex-end" gap="xs">
        <Button variant="default" size="xs" onClick={() => onSave({})}>
          Cancel
        </Button>
        <Button
          size="xs"
          onClick={() =>
            onSave({
              field,
              typeStyle,
              peopleStyle,
              text,
              wrapper,
              connector,
            })
          }
        >
          Done
        </Button>
      </Group>
    </Stack>
  );
}
