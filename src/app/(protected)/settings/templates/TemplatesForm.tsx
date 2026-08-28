"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Divider,
  Grid,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import {
  updateEventTitleTemplateAssignments,
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
  getEventTitleTemplateWarnings,
  NAME_TEMPLATE_PLACEHOLDERS,
  validateNameTemplate,
  type NameTemplateFormValues,
} from "@/lib/settings/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";
import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";

import { MasterTemplateForm } from "./MasterTemplateForm";
import { ViewTemplateForm } from "./ViewTemplateForm";
import { invalidateCurrentPathCaches } from "@/lib/pwa/client";

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



const FALLBACK_SAMPLE_USERS: PreviewUser[] = [
  { name: "John Lai", shortname: "JL", departmentName: "Engineering 1" },
  { name: "Mei Lin", shortname: "ML", departmentName: "Logistics" },
];

const FALLBACK_SAMPLE_EVENT_TYPE: PreviewEventType = { name: "Training", shortname: "TRN" };

const VIEW_LABELS: Record<string, string> = {
  month: "Month",
  week: "Week (H)",
  weekv2: "Week (D)",
  schedule: "Day",
  agenda: "Agenda",
};

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

export function TemplatesForm({
  nameTemplate,
  eventTitleTemplate,
  templates,
  assignments,
  previewUsers,
  previewEventTypes,
}: TemplatesFormProps) {
  const router = useRouter();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);

  const templateInputRef = useRef<HTMLTextAreaElement>(null);

  const [libraryOpened, { open: openLibrary, close: closeLibrary }] = useDisclosure(false);
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [editing, setEditing] = useState<EventTitleTemplateView | null>(null);
  const [assignmentsOpened, { open: openAssignments, close: closeAssignments }] = useDisclosure(false);
  const [masterOpened, { open: openMaster, close: closeMaster }] = useDisclosure(false);

  const nameTemplateForm = useForm<NameTemplateFormValues>({
    initialValues: { nameTemplate },
    validate: (values) => validateNameTemplate(values),
    validateInputOnBlur: true,
  });

  useEffect(() => {
    nameTemplateForm.setValues({ nameTemplate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameTemplate]);

  const assignmentForm = useForm<Record<string, string>>({
    initialValues: {
      month: assignments.month ?? "",
      week: assignments.week ?? "",
      weekv2: assignments.weekv2 ?? "",
      schedule: assignments.schedule ?? "",
      agenda: assignments.agenda ?? "",
    },
  });

  useEffect(() => {
    assignmentForm.setValues({
      month: assignments.month ?? "",
      week: assignments.week ?? "",
      weekv2: assignments.weekv2 ?? "",
      schedule: assignments.schedule ?? "",
      agenda: assignments.agenda ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments.month, assignments.week, assignments.weekv2, assignments.schedule, assignments.agenda]);

  const onSubmitNameTemplate = nameTemplateForm.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateNameTemplate(values.nameTemplate);
      if (result.ok) {
        notifications.show({ color: "green", message: "Name template updated" });
        void invalidateCurrentPathCaches().then(() => router.refresh());
        return;
      }
      if (result.field === "nameTemplate") {
        nameTemplateForm.setFieldError("nameTemplate", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => nameTemplateForm.getInputNode(field)),
  );

  const template = nameTemplateForm.values.nameTemplate;
  const masterWarnings = getEventTitleTemplateWarnings(eventTitleTemplate);

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
  const eventTitlePreview = formatEventTitle(eventTitleSample, eventTitleTemplate);
  const eventTitleEmptyPreview = formatEventTitle(eventTitleEmptySample, eventTitleTemplate);

  const templateMap = new Map(templates.map((t) => [t.id, t.template]));
  const masterTemplate = eventTitleTemplate;

  const openCreate = () => {
    setEditing(null);
    openForm();
  };
  const openEdit = (t: EventTitleTemplateView) => {
    setEditing(t);
    openForm();
  };
  const handleFormDone = () => {
    closeForm();
    setEditing(null);
    void invalidateCurrentPathCaches().then(() => router.refresh());
  };

  const handleAssignmentSave = async () => {
    const values = assignmentForm.values;
    const cleaned: Record<string, string | null> = {};
    for (const view of DASHBOARD_VIEW_VALUES) {
      cleaned[view] = values[view] || null;
    }
    const result = await updateEventTitleTemplateAssignments(cleaned as Record<string, string | null>);
    if (result.ok) {
      notifications.show({ color: "green", message: "View assignments updated" });
      closeAssignments();
      void invalidateCurrentPathCaches().then(() => router.refresh());
      return;
    }
    notifications.show({ color: "red", message: result.error });
  };

  const templateOptions = [
    { value: "", label: "Master (Default)" },
    ...templates.map((t) => ({ value: t.id, label: t.label })),
  ];

  // Use live assignments prop for summary (not form draft) so page summary reflects saved state
  const savedAssignedCount = DASHBOARD_VIEW_VALUES.filter((v) => assignments[v]).length;

  return (
    <>
      <Stack gap="md" className={CONTENT_ENTER_CLASS}>
        <Grid gap="md">
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
                    <Button type="submit" loading={nameTemplateForm.submitting} loaderProps={BUTTON_LOADER_PROPS}>
                      Save
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Paper>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Paper withBorder p="sm" style={{ height: "100%" }}>
              <Stack>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs" wrap="nowrap">
                      <Text fw={600}>Master Event Title Template (Google)</Text>
                      {masterWarnings.length > 0 && (
                        <Badge color="yellow" variant="light" size="xs">
                          Warning
                        </Badge>
                      )}
                    </Group>
                    <Text size="sm" c="dimmed">
                      Written to Google Calendar and used as fallback when a view has no assignment. Raw description stays editable in the event form.
                    </Text>
                    <Text size="sm" c="dimmed" lineClamp={2} style={{ overflowWrap: "anywhere" }}>
                      {eventTitleTemplate || "—"}
                    </Text>
                  </Stack>
                  <Button size="xs" variant="default" onClick={openMaster} style={{ flexShrink: 0 }}>
                    Edit master
                  </Button>
                </Group>

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
                  {masterWarnings.length > 0 && (
                    <Text size="xs" c="yellow">
                      {masterWarnings[0]}
                    </Text>
                  )}
                </Stack>
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>

        <Paper withBorder p="sm">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Stack gap={2}>
              <Text fw={600}>View Templates</Text>
              <Text size="sm" c="dimmed">
                {templates.length === 0
                  ? "No view templates yet — all views use Master (Default)."
                  : `${templates.length} template${templates.length === 1 ? "" : "s"} · ${savedAssignedCount}/5 views assigned`}
              </Text>
            </Stack>
            <Group gap="xs" wrap="nowrap">
              <Button size="xs" variant="default" onClick={openLibrary}>
                Manage templates
              </Button>
              <Button size="xs" variant="default" onClick={openAssignments}>
                Manage assignments
              </Button>
            </Group>
          </Group>
        </Paper>
      </Stack>

      {/* Library modal — entire library behind a button */}
      <Modal opened={libraryOpened} onClose={closeLibrary} title="View templates" centered size={isDesktop ? "lg" : "md"}>
        <Stack>
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              {templates.length === 0 ? "No templates yet." : `${templates.length} template${templates.length === 1 ? "" : "s"}`}
            </Text>
            <Button size="xs" onClick={openCreate}>
              Add template
            </Button>
          </Group>

          {templates.length === 0 ? (
            <Text size="sm" c="dimmed">
              Create a named template to assign to dashboard views. Until then every view shows Master (Default).
            </Text>
          ) : (
            <Stack gap="sm">
              {templates.map((t) => (
                <Paper
                  key={t.id}
                  withBorder
                  p="sm"
                  style={{ cursor: "pointer" }}
                  onClick={() => openEdit(t)}
                  {...activatable(() => openEdit(t))}
                >
                  <Stack gap={4}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={600} style={{ overflowWrap: "anywhere" }}>
                        {t.label}
                      </Text>
                      <Badge variant="light" style={{ flexShrink: 0 }}>
                        {formatEventTitle(eventTitleSample, t.template).slice(0, 24) || "—"}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed" lineClamp={1} style={{ overflowWrap: "anywhere" }}>
                      {formatEventTitle(eventTitleSample, t.template) || "—"} · empty: {formatEventTitle(eventTitleEmptySample, t.template) || "—"}
                    </Text>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Modal>

      {/* Add/Edit form modal (layered above library) */}
      <Modal
        opened={formOpened}
        onClose={closeForm}
        title={editing ? "Edit template" : "Add template"}
        centered
        size={isDesktop ? "md" : "sm"}
        zIndex={310}
      >
        <ViewTemplateForm
          key={editing?.id ?? "new"}
          template={editing}
          existingLabels={templates.filter((x) => x.id !== editing?.id).map((x) => x.label)}
          sample={eventTitleSample}
          emptySample={eventTitleEmptySample}
          onDone={handleFormDone}
        />
      </Modal>

      {/* Assignments modal */}
      <Modal opened={assignmentsOpened} onClose={closeAssignments} title="View assignments" centered size={isDesktop ? "md" : "sm"}>
        <Stack>
          <Text size="sm" c="dimmed">
            Choose which view template each dashboard view displays. Empty = Master (Default). Any view can use any token.
          </Text>

          <Stack gap="sm">
            {DASHBOARD_VIEW_VALUES.map((view) => {
              const assignedId = assignmentForm.values[view] ?? "";
              const tpl = assignedId ? (templateMap.get(assignedId) ?? masterTemplate) : masterTemplate;
              return (
                <Stack key={view} gap="xs">
                  <NoKeyboardSelect
                    label={VIEW_LABELS[view] ?? view}
                    data={templateOptions}
                    value={assignedId}
                    onChange={(val) => assignmentForm.setFieldValue(view, val ?? "")}
                    placeholder="Master (Default)"
                    searchable={false}
                    allowDeselect
                    clearable
                  />
                  <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                    Preview: {formatEventTitle(eventTitleSample, tpl) || "—"} · Empty: {formatEventTitle(eventTitleEmptySample, tpl) || "—"}
                  </Text>
                </Stack>
              );
            })}
          </Stack>

          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeAssignments}>
              Cancel
            </Button>
            <Button onClick={handleAssignmentSave} loaderProps={BUTTON_LOADER_PROPS}>
              Save assignments
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={masterOpened} onClose={closeMaster} title="Master Event Title Template" centered size={isDesktop ? "md" : "sm"}>
        <MasterTemplateForm
          key={eventTitleTemplate}
          initialTemplate={eventTitleTemplate}
          sample={eventTitleSample}
          emptySample={eventTitleEmptySample}
          onDone={() => {
            closeMaster();
            void invalidateCurrentPathCaches().then(() => router.refresh());
          }}
        />
      </Modal>
    </>
  );
}