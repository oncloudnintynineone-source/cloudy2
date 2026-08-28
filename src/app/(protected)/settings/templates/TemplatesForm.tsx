"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Divider, Grid, Group, Paper, Stack, Text, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import {
  updateEventTitleTemplate,
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

interface PreviewUser {
  name: string;
  shortname: string | null;
  departmentName: string | null;
}

interface PreviewEventType {
  name: string;
  shortname: string | null;
}

interface TemplatesFormProps {
  nameTemplate: string;
  eventTitleTemplate: string;
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
  previewUsers,
  previewEventTypes,
}: TemplatesFormProps) {
  const router = useRouter();
  const templateInputRef = useRef<HTMLTextAreaElement>(null);
  const eventTemplateInputRef = useRef<HTMLTextAreaElement>(null);

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
        notifications.show({ color: "green", message: "Event title template updated" });
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

  // Event title preview: up to two real users stand in for the invitees, so
  // the admin sees how the template renders with the saved display-name
  // template for the fully qualified style.
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

  return (
    <Grid className={CONTENT_ENTER_CLASS} gap="md">
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

      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Paper withBorder p="sm" style={{ height: "100%" }}>
          <form onSubmit={onSubmitEventTitleTemplate}>
            <Stack>
              <Text fw={600}>Event Title Template</Text>
              <Text size="sm" c="dimmed">
                Compose the title calendar events get in Google. The raw description stays editable
                in the event form; the rendered title is what shows on the calendar.
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
                  Preview
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
                  <Text size="xs" c="dimmed">
                    (type, people, departments, location blank — falls back to description when
                    template renders empty)
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
  );
}
