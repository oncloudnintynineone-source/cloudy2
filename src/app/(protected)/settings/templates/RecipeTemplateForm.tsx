"use client";

import { useState } from "react";
import {
  ActionIcon,
  Button,
  Divider,
  Grid,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";

import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";
import {
  createEventTitleTemplate,
  deleteEventTitleTemplate,
  updateEventTitleRecipe,
  updateEventTitleTemplateById,
  type SettingsActionResult,
} from "@/lib/settings/actions";
import {
  renderTitleRecipe,
  TITLE_FIELD_LABELS,
  TITLE_PEOPLE_STYLES,
  TITLE_RECIPE_CONNECTORS,
  TITLE_RECIPE_FIELDS,
  TITLE_RECIPE_MAX_SEGMENTS,
  TITLE_RECIPE_WRAPPERS,
  TITLE_TYPE_STYLES,
  type EventTitleRecipeInput,
  type TitlePeopleStyle,
  type TitleRecipe,
  type TitleRecipeConnector,
  type TitleRecipeField,
  type TitleRecipeWrapper,
  type TitleTypeStyle,
} from "@/lib/settings/titleRecipe";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

interface RecipeTemplateFormProps {
  /** null = create a library template; omit label UI entirely for the master. */
  mode: "master" | "create" | "edit";
  /** Editing target (mode "edit"). */
  templateId?: string;
  /** Seed label (mode "create"/"edit"). */
  label?: string;
  /** Seed recipe (all modes). */
  recipe: TitleRecipe;
  sample: EventTitleRecipeInput;
  emptySample: EventTitleRecipeInput;
  /** Rendered after a successful save (parent closes the modal + refreshes). */
  onDone: () => void;
}

interface SegmentRow {
  field: TitleRecipeField;
  typeStyle?: TitleTypeStyle;
  peopleStyle?: TitlePeopleStyle;
  wrapper: TitleRecipeWrapper;
  connector: TitleRecipeConnector;
}

const CONNECTOR_LABELS: Record<TitleRecipeConnector, string> = {
  none: "None",
  space: "Space",
  comma: "Comma (,)",
  dash: "Dash (–)",
  colon: "Colon (:)",
  middot: "Dot (·)",
};

const CONNECTOR_OPTIONS = TITLE_RECIPE_CONNECTORS.map((connector) => ({
  value: connector,
  label: CONNECTOR_LABELS[connector],
}));

const FIELD_OPTIONS = TITLE_RECIPE_FIELDS.map((field) => ({
  value: field,
  label: TITLE_FIELD_LABELS[field],
}));

const WRAPPER_OPTIONS = TITLE_RECIPE_WRAPPERS.map((wrapper) => ({
  value: wrapper,
  label: wrapper === "none" ? "No brackets" : wrapper === "paren" ? "( )" : "[ ]",
}));

const STYLE_OPTIONS: Partial<Record<TitleRecipeField, { value: string; label: string }[]>> = {
  type: TITLE_TYPE_STYLES.map((style) => ({ value: style, label: style === "acronym" ? "Acronym" : "Name" })),
  people: TITLE_PEOPLE_STYLES.map((style) => ({
    value: style,
    label:
      style === "fqn"
        ? "Full name + department"
        : style === "full"
          ? "Name"
          : "Acronym",
  })),
};

function toRows(recipe: TitleRecipe): SegmentRow[] {
  return recipe.segments.map((segment) => ({
    field: segment.field,
    typeStyle: segment.typeStyle,
    peopleStyle: segment.peopleStyle,
    wrapper: segment.wrapper ?? "none",
    connector: segment.connector ?? "none",
  }));
}

function toRecipe(rows: SegmentRow[]): TitleRecipe {
  return {
    segments: rows.map((row) => ({
      field: row.field,
      typeStyle: row.field === "type" ? row.typeStyle : undefined,
      peopleStyle: row.field === "people" ? row.peopleStyle : undefined,
      wrapper: row.wrapper === "none" ? undefined : row.wrapper,
      connector: row.connector === "none" ? undefined : row.connector,
    })),
  };
}

function defaultStyleFor(field: TitleRecipeField): Partial<SegmentRow> {
  if (field === "type") return { typeStyle: "acronym" };
  if (field === "people") return { peopleStyle: "fqn" };
  return {};
}

export function RecipeTemplateForm({
  mode,
  templateId,
  label: initialLabel,
  recipe: initialRecipe,
  sample,
  emptySample,
  onDone,
}: RecipeTemplateFormProps) {
  const [label, setLabel] = useState(initialLabel ?? "");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [rows, setRows] = useState<SegmentRow[]>(() => toRows(initialRecipe));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const setSegment = (index: number, patch: Partial<SegmentRow>) => {
    setRows((current) => {
      const next = current.map((row, i) => (i === index ? { ...row, ...patch } : row));
      return next;
    });
  };

  const move = (index: number, delta: -1 | 1) => {
    setRows((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row);
      return next;
    });
  };

  const remove = (index: number) => {
    setRows((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  };

  const addSegment = () => {
    setRows((current) =>
      current.length >= TITLE_RECIPE_MAX_SEGMENTS
        ? current
        : [...current, { field: "description", wrapper: "none", connector: "space", ...defaultStyleFor("description") }],
    );
  };

  const changeField = (index: number, field: TitleRecipeField) => {
    setSegment(index, { field, ...defaultStyleFor(field) });
  };

  const recipe = toRecipe(rows);
  const preview = renderTitleRecipe(sample, recipe);
  const emptyPreview = renderTitleRecipe(emptySample, recipe);

  const submit = async () => {
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

  return (
    <Stack>
      {mode !== "master" && (
        <TextInput
          label="Name"
          description="Used in dropdowns — e.g. Compact, Detailed"
          placeholder="e.g. Compact"
          value={label}
          error={labelError ?? undefined}
          onChange={(event) => {
            setLabel(event.currentTarget.value);
            if (labelError) setLabelError(null);
          }}
        />
      )}

      <Stack gap="xs">
        {rows.map((row, index) => (
          <Paper key={index} withBorder p="xs">
            <Stack gap={8}>
              <Group justify="space-between" wrap="nowrap">
                <Group gap={4}>
                  <ActionIcon
                    size="sm"
                    variant="default"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <IconChevronUp size={16} />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="default"
                    aria-label="Move down"
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <IconChevronDown size={16} />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="default"
                    color="red"
                    aria-label="Remove field"
                    disabled={rows.length <= 1}
                    onClick={() => remove(index)}
                  >
                    <IconTrash size={15} />
                  </ActionIcon>
                </Group>
                <Text size="xs" c="dimmed">
                  Field {index + 1}
                </Text>
              </Group>

              <NoKeyboardSelect
                label="Field"
                data={FIELD_OPTIONS}
                value={row.field}
                onChange={(value) => {
                  const field = value as TitleRecipeField;
                  if (field) changeField(index, field);
                }}
                searchable={false}
              />

              {row.field === "type" && (
                <NoKeyboardSelect
                  label="Type style"
                  data={STYLE_OPTIONS.type ?? []}
                  value={row.typeStyle ?? "name"}
                  onChange={(value) => setSegment(index, { typeStyle: (value as TitleTypeStyle) ?? "name" })}
                  searchable={false}
                />
              )}

              {row.field === "people" && (
                <NoKeyboardSelect
                  label="People style"
                  data={STYLE_OPTIONS.people ?? []}
                  value={row.peopleStyle ?? "fqn"}
                  onChange={(value) => setSegment(index, { peopleStyle: (value as TitlePeopleStyle) ?? "fqn" })}
                  searchable={false}
                />
              )}

              <Grid>
                <Grid.Col span={{ base: 12, xs: 6 }}>
                  <NoKeyboardSelect
                    label="Brackets"
                    data={WRAPPER_OPTIONS}
                    value={row.wrapper}
                    onChange={(value) => setSegment(index, { wrapper: (value as TitleRecipeWrapper) ?? "none" })}
                    searchable={false}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, xs: 6 }}>
                  <NoKeyboardSelect
                    label="Join after this field"
                    description="Applied when more fields follow it (never leading/trailing)."
                    data={CONNECTOR_OPTIONS}
                    value={row.connector}
                    onChange={(value) => setSegment(index, { connector: (value as TitleRecipeConnector) ?? "none" })}
                    searchable={false}
                  />
                </Grid.Col>
              </Grid>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Button
        type="button"
        size="xs"
        variant="default"
        leftSection={<IconPlus size={15} />}
        disabled={rows.length >= TITLE_RECIPE_MAX_SEGMENTS}
        onClick={addSegment}
      >
        Add field
      </Button>

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

      <Group justify={mode === "edit" ? "space-between" : "flex-end"}>
        {mode === "edit" && !confirmDelete && (
          <Button color="red" variant="light" size="xs" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
        {mode === "edit" && confirmDelete && (
          <Group gap="xs">
            <Text size="xs" c="red">
              Delete this template?
            </Text>
            <Button size="xs" variant="default" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button size="xs" color="red" loading={deleting} loaderProps={BUTTON_LOADER_PROPS} onClick={handleDelete}>
              Confirm delete
            </Button>
          </Group>
        )}
        <Button type="button" loading={saving} loaderProps={BUTTON_LOADER_PROPS} onClick={() => void submit()}>
          {mode === "create" ? "Create" : "Save"}
        </Button>
      </Group>
    </Stack>
  );
}
