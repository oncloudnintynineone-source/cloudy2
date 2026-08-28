"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Divider,
  Grid,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import {
  createEventTitleTemplate,
  deleteEventTitleTemplate,
  updateEventTitleTemplate,
  updateEventTitleTemplateAssignments,
  updateEventTitleTemplateById,
  updateNameTemplate,
  type SettingsActionResult,
} from "@/lib/settings/actions";
import {
  formatEventTitle,
  type EventTitleInput,
  type EventTitlePerson,
} from "@/lib/settings/formatEventTitle";
import { formatFullName } from "@/lib/settings/formatName";
import {
  DASHBOARD_VIEW_VALUES,
  EVENT_TITLE_PLACEHOLDERS,
  getEventTitleTemplateWarnings,
  NAME_TEMPLATE_PLACEHOLDERS,
  validateEventTitleTemplate,
  validateNameTemplate,
  type EventTitleTemplateFormValues,
  type NameTemplateFormValues,
} from "@/lib/settings/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";
import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";

interface PreviewUser {
  name: string;
  shortname: string | null;
  departmentName: string | null;
}

interface PreviewEventType {
  name: string;
  shortname: string | null;
}

interface EventTitleTemplateView {
  id: string;
  label: string;
  template: string;
}

interface TemplatesFormProps {
  nameTemplate: string;
  eventTitleTemplate: string;
  templates: EventTitleTemplateView[];
  assignments: Record<string, string>;
  previewUsers: PreviewUser[];
  previewEventTypes: PreviewEventType[];
}

const EXAMPLE = { name: "John Lai", departmentName: "Engineering 1" };

const SAMPLE_EVENT_DESCRIPTION = "Team offsite";

const SAMPLE_EVENT_LOCATION = "Hall A";

const PEOPLE_STYLE_HINT =
  "{people} = fully qualified · {people:full} = name · {people:acronym} = shortname";

const TYPE_STYLE_HINT = "{type} = name · {type:acronym} = shortname";

const CONDITIONAL_HINT =
  "Wrap punctuation with a field in < > to hide it when empty — e.g. {description}< - {location}>< ({people:acronym})>. Escape literal < > with \\< \\>.";

const FALLBACK_SAMPLE_USERS: PreviewUser[] = [
  { name: "John Lai", shortname: "JL", departmentName: "Engineering 1" },
  { name: "Mei Lin", shortname: "ML", departmentName: "Logistics" },
];

const FALLBACK_SAMPLE_EVENT_TYPE: PreviewEventType = { name: "Training", shortname: "TRN" };

const VIEW_LABELS: Record<string, string> = {
  month: "Month",
  week: "Week",
  weekv2: "Week v2",
  schedule: "Day",
  agenda: "Agenda",
};

/** Insert a placeholder token at the cursor position of a template input. */
function insertTokenAtCursor(
  current: string,
  setValue: (value: string) => void,
  input: HTMLTextAreaElement | null,
  token: string,
) {
  if (!input) {
    setValue(current + token);
    return;
  }
  const start = input.selectionStart ?? current.length;
  const end = input.selectionEnd ?? current.length;
  setValue(current.slice(0, start) + token + current.slice(end));
  requestAnimationFrame(() => {
    input.focus();
    const pos = start + token.length;
    input.setSelectionRange(pos, pos);
  });
}

function wrapSelectionInConditional(
  current: string,
  setValue: (value: string) => void,
  input: HTMLTextAreaElement | null,
) {
  if (!input) {
    setValue(`${current}<>`);
    return;
  }
  const start = input.selectionStart ?? current.length;
  const end = input.selectionEnd ?? current.length;
  const hasSelection = start !== end;
  if (hasSelection) {
    const selected = current.slice(start, end);
    setValue(`${current.slice(0, start)}<${selected}>${current.slice(end)}`);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + 1, start + 1 + selected.length);
    });
  } else {
    setValue(`${current.slice(0, start)}<>${current.slice(end)}`);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + 1;
      input.setSelectionRange(pos, pos);
    });
  }
}

export function TemplatesForm({
  nameTemplate,
  eventTitleTemplate,
  templates,
  assignments,
  previewUsers,
  previewEventTypes,
}: TemplatesFormProps) {
  const router = useRouter();
  const templateInputRef = useRef<HTMLTextAreaElement>(null);
  const eventTemplateInputRef = useRef<HTMLTextAreaElement>(null);
  const libraryTemplateRef = useRef<HTMLTextAreaElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [newSaving, setNewSaving] = useState(false);
  const [newLabelError, setNewLabelError] = useState<string | null>(null);
  const [newTemplateError, setNewTemplateError] = useState<string | null>(null);
  const [editLabelError, setEditLabelError] = useState<string | null>(null);
  const [editTemplateError, setEditTemplateError] = useState<string | null>(null);

  const nameTemplateForm = useForm<NameTemplateFormValues>({
    initialValues: { nameTemplate },
    validate: (values) => validateNameTemplate(values),
    validateInputOnBlur: true,
  });

  const eventTitleTemplateForm = useForm<EventTitleTemplateFormValues>({
    initialValues: { eventTitleTemplate },
    validate: (values) => validateEventTitleTemplate(values),
    validateInputOnBlur: true,
  });

  const assignmentForm = useForm<Record<string, string>>({
    initialValues: {
      month: assignments.month ?? "",
      week: assignments.week ?? "",
      weekv2: assignments.weekv2 ?? "",
      schedule: assignments.schedule ?? "",
      agenda: assignments.agenda ?? "",
    },
  });

  const onSubmitNameTemplate = nameTemplateForm.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateNameTemplate(values.nameTemplate);

      if (result.ok) {
        notifications.show({ color: "green", message: "Name template updated" });
        router.refresh();
        return;
      }

      if (result.field === "nameTemplate") {
        nameTemplateForm.setFieldError("nameTemplate", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => nameTemplateForm.getInputNode(field)),
  );

  const onSubmitEventTitleTemplate = eventTitleTemplateForm.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateEventTitleTemplate(
        values.eventTitleTemplate,
      );

      if (result.ok) {
        notifications.show({ color: "green", message: "Master template updated" });
        router.refresh();
        return;
      }

      if (result.field === "eventTitleTemplate") {
        eventTitleTemplateForm.setFieldError("eventTitleTemplate", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => eventTitleTemplateForm.getInputNode(field)),
  );

  const template = nameTemplateForm.values.nameTemplate;
  const eventTitleTemplateValue = eventTitleTemplateForm.values.eventTitleTemplate;
  const eventTitleWarnings = getEventTitleTemplateWarnings(eventTitleTemplateValue);

  const sampleUsers = (previewUsers.length > 0 ? previewUsers : FALLBACK_SAMPLE_USERS).slice(0, 2);
  const samplePeople: EventTitlePerson[] = sampleUsers.map((user) => ({
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
  const sampleEventType = previewEventTypes[0] ?? FALLBACK_SAMPLE_EVENT_TYPE;
  const eventTitleSample: EventTitleInput = {
    description: SAMPLE_EVENT_DESCRIPTION,
    eventType: {
      name: sampleEventType.name,
      acronym: sampleEventType.shortname || sampleEventType.name,
    },
    people: samplePeople,
    departments: sampleDepartments,
    location: SAMPLE_EVENT_LOCATION,
  };
  const eventTitleEmptySample: EventTitleInput = {
    description: SAMPLE_EVENT_DESCRIPTION,
    eventType: null,
    people: [],
    departments: [],
    location: "",
  };
  const eventTitlePreview = formatEventTitle(eventTitleSample, eventTitleTemplateValue);
  const eventTitleEmptyPreview = formatEventTitle(eventTitleEmptySample, eventTitleTemplateValue);

  // Helpers for library assignment preview
  const templateMap = new Map(templates.map((t) => [t.id, t.template]));
  const masterTemplate = eventTitleTemplateValue;

  const handleAdd = async () => {
    setNewLabelError(null);
    setNewTemplateError(null);
    if (!newLabel.trim()) {
      setNewLabelError("Label is required");
      return;
    }
    if (newLabel.trim().length > 40) {
      setNewLabelError("Label must be 40 characters or fewer");
      return;
    }
    if (/\r|\n/.test(newLabel)) {
      setNewLabelError("Label must be a single line");
      return;
    }
    if (templates.some((t) => t.label.toLowerCase() === newLabel.trim().toLowerCase())) {
      setNewLabelError("Label must be unique");
      return;
    }
    if (!newTemplate.trim()) {
      setNewTemplateError("Template is required");
      return;
    }
    if (/\r|\n/.test(newTemplate)) {
      setNewTemplateError("Template must be a single line");
      return;
    }
    if (newTemplate.trim().length > 300) {
      setNewTemplateError("Template must be 300 characters or fewer");
      return;
    }
    setNewSaving(true);
    const result = await createEventTitleTemplate(newLabel.trim(), newTemplate.trim());
    setNewSaving(false);
    if (result.ok) {
      notifications.show({ color: "green", message: "Template created" });
      setNewLabel("");
      setNewTemplate("");
      setShowAdd(false);
      router.refresh();
      return;
    }
    if (result.field === "templateLabel") setNewLabelError(result.error);
    else if (result.field === "template") setNewTemplateError(result.error);
    notifications.show({ color: "red", message: result.error });
  };

  const startEdit = (t: EventTitleTemplateView) => {
    setEditingId(t.id);
    setEditLabel(t.label);
    setEditTemplate(t.template);
    setEditLabelError(null);
    setEditTemplateError(null);
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    setEditLabelError(null);
    setEditTemplateError(null);
    if (!editLabel.trim()) {
      setEditLabelError("Label is required");
      return;
    }
    if (editLabel.trim().length > 40) {
      setEditLabelError("Label must be 40 characters or fewer");
      return;
    }
    if (/\r|\n/.test(editLabel)) {
      setEditLabelError("Label must be a single line");
      return;
    }
    if (
      templates.some(
        (t) => t.id !== editingId && t.label.toLowerCase() === editLabel.trim().toLowerCase(),
      )
    ) {
      setEditLabelError("Label must be unique");
      return;
    }
    if (!editTemplate.trim()) {
      setEditTemplateError("Template is required");
      return;
    }
    if (/\r|\n/.test(editTemplate)) {
      setEditTemplateError("Template must be a single line");
      return;
    }
    if (editTemplate.trim().length > 300) {
      setEditTemplateError("Template must be 300 characters or fewer");
      return;
    }
    setEditSaving(true);
    const result = await updateEventTitleTemplateById(editingId, editLabel.trim(), editTemplate.trim());
    setEditSaving(false);
    if (result.ok) {
      notifications.show({ color: "green", message: "Template updated" });
      setEditingId(null);
      router.refresh();
      return;
    }
    if (result.field === "templateLabel") setEditLabelError(result.error);
    else if (result.field === "template") setEditTemplateError(result.error);
    notifications.show({ color: "red", message: result.error });
  };

  const handleDelete = async (id: string) => {
    const result = await deleteEventTitleTemplate(id);
    if (result.ok) {
      notifications.show({ color: "green", message: "Template deleted" });
      router.refresh();
      return;
    }
    notifications.show({ color: "red", message: result.error });
  };

  const handleAssignmentSave = async () => {
    const values = assignmentForm.values;
    const cleaned: Record<string, string | null> = {};
    for (const view of DASHBOARD_VIEW_VALUES) {
      cleaned[view] = values[view] || null;
    }
    const result = await updateEventTitleTemplateAssignments(
      cleaned as Record<string, string | null>,
    );
    if (result.ok) {
      notifications.show({ color: "green", message: "View assignments updated" });
      router.refresh();
      return;
    }
    notifications.show({ color: "red", message: result.error });
  };

  const templateOptions = [
    { value: "", label: "(Master) " + (masterTemplate.slice(0, 30) || "{description}") + (masterTemplate.length > 30 ? "…" : "") },
    ...templates.map((t) => ({ value: t.id, label: t.label })),
  ];

  return (
    <Stack gap="md" className={CONTENT_ENTER_CLASS}>
      <Grid gap="md">
        {/* Display Name */}
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Paper withBorder p="sm" style={{ height: "100%" }}>
            <form onSubmit={onSubmitNameTemplate}>
              <Stack>
                <Text fw={600}>Display Name Template</Text>
                <Text size="sm" c="dimmed">
                  Compose a user&apos;s fully qualified name from their name and department. The
                  result is used wherever a user&apos;s full name is shown.
                </Text>

                <Textarea
                  ref={templateInputRef}
                  label="Template"
                  description="Insert tokens to splice in the user's name and department."
                  placeholder={"{name}\n— e.g. {name}: DEPT-{department}"}
                  autosize
                  minRows={3}
                  maxRows={8}
                  {...nameTemplateForm.getInputProps("nameTemplate")}
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
                      onClick={() =>
                        insertTokenAtCursor(
                          nameTemplateForm.values.nameTemplate,
                          (value) => nameTemplateForm.setFieldValue("nameTemplate", value),
                          templateInputRef.current,
                          token,
                        )
                      }
                    >
                      {token}
                    </Button>
                  ))}
                </Group>

                <Divider />

                <Stack gap={4}>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    Preview
                  </Text>
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm">{EXAMPLE.name}</Text>
                    <Text size="sm" fw={600} ta="right">
                      {formatFullName(EXAMPLE, template) || "—"}
                    </Text>
                  </Group>
                  {previewUsers.map((user) => (
                    <Group key={user.name} justify="space-between" wrap="nowrap">
                      <Text size="sm" c="dimmed">
                        {user.name}
                      </Text>
                      <Text size="sm" fw={600} ta="right" c="dimmed">
                        {formatFullName(user, template) || "—"}
                      </Text>
                    </Group>
                  ))}
                </Stack>

                <Group justify="flex-end">
                  <Button
                    type="submit"
                    loading={nameTemplateForm.submitting}
                    loaderProps={BUTTON_LOADER_PROPS}
                  >
                    Save
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
        </Grid.Col>

        {/* Master Template */}
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Paper withBorder p="sm" style={{ height: "100%" }}>
            <form onSubmit={onSubmitEventTitleTemplate}>
              <Stack>
                <Text fw={600}>Master Event Title Template (Google)</Text>
                <Text size="sm" c="dimmed">
                  This title is written to Google Calendar and used as the fallback when a view
                  has no assigned template. The raw description stays editable in the event form.
                </Text>

                <Textarea
                  ref={eventTemplateInputRef}
                  label="Template"
                  description="Insert tokens to build the event title. Use < > to hide punctuation when a field is empty."
                  placeholder={
                    "{type:acronym}: {description}\n< ({people:acronym})>\n< - {location}>\n<, {departments}>"
                  }
                  autosize
                  minRows={3}
                  maxRows={8}
                  {...eventTitleTemplateForm.getInputProps("eventTitleTemplate")}
                />

                {eventTitleWarnings.length > 0 && (
                  <Alert color="yellow" variant="light" p="xs">
                    {eventTitleWarnings.map((w) => (
                      <Text key={w} size="xs">
                        {w}
                      </Text>
                    ))}
                  </Alert>
                )}

                <Group gap={6} wrap="wrap">
                  <Text size="xs" c="dimmed">
                    Insert:
                  </Text>
                  {EVENT_TITLE_PLACEHOLDERS.map((token) => (
                    <Button
                      key={token}
                      type="button"
                      size="compact-xs"
                      variant="default"
                      onClick={() =>
                        insertTokenAtCursor(
                          eventTitleTemplateValue,
                          (value) =>
                            eventTitleTemplateForm.setFieldValue("eventTitleTemplate", value),
                          eventTemplateInputRef.current,
                          token,
                        )
                      }
                    >
                      {token}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="compact-xs"
                    variant="default"
                    onClick={() =>
                      wrapSelectionInConditional(
                        eventTitleTemplateValue,
                        (value) =>
                          eventTitleTemplateForm.setFieldValue("eventTitleTemplate", value),
                        eventTemplateInputRef.current,
                      )
                    }
                  >
                    {"Wrap in < >"}
                  </Button>
                </Group>

                <Text size="xs" c="dimmed">
                  {TYPE_STYLE_HINT}
                </Text>
                <Text size="xs" c="dimmed">
                  {PEOPLE_STYLE_HINT}
                </Text>
                <Text size="xs" c="dimmed">
                  {CONDITIONAL_HINT}
                </Text>

                <Divider />

                <Stack gap={4}>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    Preview (Master)
                  </Text>
                  <Text size="xs" c="dimmed">
                    {eventTitleSample.description}
                    {eventTitleSample.eventType ? ` · ${eventTitleSample.eventType.name}` : ""} ·{" "}
                    {samplePeople.map((person) => person.acronym).join(", ") || "no invitees"} ·{" "}
                    {sampleDepartments.join(", ") || "no departments"} · {eventTitleSample.location}
                  </Text>
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">
                      All fields:
                    </Text>
                    <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
                      {eventTitlePreview || "—"}
                    </Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">
                      When optional fields empty:
                    </Text>
                    <Text size="sm" fw={600} c="dimmed" style={{ overflowWrap: "anywhere" }}>
                      {eventTitleEmptyPreview || "—"}
                    </Text>
                  </Stack>
                </Stack>

                <Group justify="flex-end">
                  <Button
                    type="submit"
                    loading={eventTitleTemplateForm.submitting}
                    loaderProps={BUTTON_LOADER_PROPS}
                  >
                    Save
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
        </Grid.Col>
      </Grid>

      {/* Library */}
      <Paper withBorder p="sm">
        <Stack>
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text fw={600}>View Templates Library</Text>
              <Text size="sm" c="dimmed">
                Named reusable templates. Assign them to dashboard views below. Any view without an
                assignment falls back to the master template above.
              </Text>
            </Stack>
            <Button size="xs" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "Cancel" : "Add template"}
            </Button>
          </Group>

          {showAdd && (
            <Paper withBorder p="sm">
              <Stack>
                <TextInput
                  label="Label"
                  placeholder="e.g. Compact"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.currentTarget.value)}
                  error={newLabelError}
                  maxLength={40}
                />
                <Textarea
                  ref={libraryTemplateRef}
                  label="Template"
                  placeholder="{description}< - {location}>"
                  autosize
                  minRows={3}
                  maxRows={8}
                  value={newTemplate}
                  onChange={(e) => setNewTemplate(e.currentTarget.value)}
                  error={newTemplateError}
                />
                {getEventTitleTemplateWarnings(newTemplate).length > 0 && (
                  <Alert color="yellow" variant="light" p="xs">
                    {getEventTitleTemplateWarnings(newTemplate).map((w) => (
                      <Text key={w} size="xs">
                        {w}
                      </Text>
                    ))}
                  </Alert>
                )}
                <Group gap={6} wrap="wrap">
                  <Text size="xs" c="dimmed">
                    Insert:
                  </Text>
                  {EVENT_TITLE_PLACEHOLDERS.map((token) => (
                    <Button
                      key={token}
                      type="button"
                      size="compact-xs"
                      variant="default"
                      onClick={() => insertTokenAtCursor(newTemplate, setNewTemplate, libraryTemplateRef.current, token)}
                    >
                      {token}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="compact-xs"
                    variant="default"
                    onClick={() => wrapSelectionInConditional(newTemplate, setNewTemplate, libraryTemplateRef.current)}
                  >
                    {"Wrap in < >"}
                  </Button>
                </Group>
                <Group justify="flex-end">
                  <Button loading={newSaving} loaderProps={BUTTON_LOADER_PROPS} onClick={handleAdd}>
                    Create
                  </Button>
                </Group>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">
                    Preview:
                  </Text>
                  <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
                    {formatEventTitle(eventTitleSample, newTemplate) || "—"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Empty: {formatEventTitle(eventTitleEmptySample, newTemplate) || "—"}
                  </Text>
                </Stack>
              </Stack>
            </Paper>
          )}

          {templates.length === 0 ? (
            <Text size="sm" c="dimmed">
              No view templates yet. Create one above. Until then every view shows the master template.
            </Text>
          ) : (
            <Stack gap="sm">
              {templates.map((t) => (
                <Paper key={t.id} withBorder p="sm">
                  {editingId === t.id ? (
                    <Stack>
                      <TextInput
                        label="Label"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.currentTarget.value)}
                        error={editLabelError}
                        maxLength={40}
                      />
                      <Textarea
                        label="Template"
                        autosize
                        minRows={3}
                        maxRows={8}
                        value={editTemplate}
                        onChange={(e) => setEditTemplate(e.currentTarget.value)}
                        error={editTemplateError}
                      />
                      {getEventTitleTemplateWarnings(editTemplate).length > 0 && (
                        <Alert color="yellow" variant="light" p="xs">
                          {getEventTitleTemplateWarnings(editTemplate).map((w) => (
                            <Text key={w} size="xs">
                              {w}
                            </Text>
                          ))}
                        </Alert>
                      )}
                      <Group gap={6} wrap="wrap">
                        <Text size="xs" c="dimmed">
                          Insert:
                        </Text>
                        {EVENT_TITLE_PLACEHOLDERS.map((token) => (
                          <Button
                            key={token}
                            type="button"
                            size="compact-xs"
                            variant="default"
                            onClick={() => insertTokenAtCursor(editTemplate, setEditTemplate, libraryTemplateRef.current, token)}
                          >
                            {token}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          size="compact-xs"
                          variant="default"
                          onClick={() => wrapSelectionInConditional(editTemplate, setEditTemplate, libraryTemplateRef.current)}
                        >
                          {"Wrap in < >"}
                        </Button>
                      </Group>
                      <Group justify="flex-end" gap="xs">
                        <Button variant="default" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                        <Button loading={editSaving} loaderProps={BUTTON_LOADER_PROPS} onClick={handleEditSave}>
                          Save
                        </Button>
                      </Group>
                    </Stack>
                  ) : (
                    <Stack gap="xs">
                      <Group justify="space-between" wrap="nowrap">
                        <Text fw={600}>{t.label}</Text>
                        <Group gap="xs">
                          <Button size="compact-xs" variant="default" onClick={() => startEdit(t)}>
                            Edit
                          </Button>
                          <Button size="compact-xs" variant="light" color="red" onClick={() => handleDelete(t.id)}>
                            Delete
                          </Button>
                        </Group>
                      </Group>
                      <Text size="sm" style={{ overflowWrap: "anywhere" }} c="dimmed">
                        {t.template}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Preview (all fields): {formatEventTitle(eventTitleSample, t.template) || "—"}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Preview (empty): {formatEventTitle(eventTitleEmptySample, t.template) || "—"}
                      </Text>
                    </Stack>
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Per-view assignment */}
      <Paper withBorder p="sm">
        <Stack>
          <Text fw={600}>Per-View Assignments (Dashboard)</Text>
          <Text size="sm" c="dimmed">
            Choose which library template each dashboard view should display. Empty means the master (Google) template. Any view can use any token.
          </Text>

          <Stack gap="sm">
            {DASHBOARD_VIEW_VALUES.map((view) => {
              const assignedId = assignmentForm.values[view] ?? "";
              const tpl = assignedId ? (templateMap.get(assignedId) ?? masterTemplate) : masterTemplate;
              const isMaster = !assignedId;
              return (
                <Group key={view} grow align="end">
                  <NoKeyboardSelect
                    label={VIEW_LABELS[view] ?? view}
                    data={templateOptions}
                    value={assignedId}
                    onChange={(val) => assignmentForm.setFieldValue(view, val ?? "")}
                    placeholder="(Master)"
                    searchable={false}
                    allowDeselect
                    clearable
                  />
                  <Stack gap={2} style={{ flex: 1 }}>
                    <Text size="xs" c="dimmed">
                      {isMaster ? "Master" : templateMap.get(assignedId) ? templates.find((t) => t.id === assignedId)?.label : "Unknown"}: {formatEventTitle(eventTitleSample, tpl) || "—"}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Empty: {formatEventTitle(eventTitleEmptySample, tpl) || "—"}
                    </Text>
                  </Stack>
                </Group>
              );
            })}
          </Stack>

          <Group justify="flex-end">
            <Button onClick={handleAssignmentSave} loaderProps={BUTTON_LOADER_PROPS}>
              Save assignments
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
