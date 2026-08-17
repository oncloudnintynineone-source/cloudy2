"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Button, Divider, Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

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
  NAME_TEMPLATE_PLACEHOLDERS,
  validateEventTitleTemplate,
  validateNameTemplate,
  type EventTitleTemplateFormValues,
  type NameTemplateFormValues,
} from "@/lib/settings/validate";

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

const PEOPLE_STYLE_HINT =
  "{people} = fully qualified · {people:full} = name · {people:acronym} = shortname";

const TYPE_STYLE_HINT = "{type} = name · {type:acronym} = shortname";

const FALLBACK_SAMPLE_USERS: PreviewUser[] = [
  { name: "John Lai", shortname: "JL", departmentName: "Engineering 1" },
  { name: "Mei Lin", shortname: "ML", departmentName: "Logistics" },
];

const FALLBACK_SAMPLE_EVENT_TYPE: PreviewEventType = { name: "Training", shortname: "TRN" };

/** Insert a placeholder token at the cursor position of a template input. */
function insertTokenAtCursor(
  current: string,
  setValue: (value: string) => void,
  input: HTMLInputElement | null,
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

export function TemplatesForm({
  nameTemplate,
  eventTitleTemplate,
  previewUsers,
  previewEventTypes,
}: TemplatesFormProps) {
  const router = useRouter();
  const templateInputRef = useRef<HTMLInputElement>(null);
  const eventTemplateInputRef = useRef<HTMLInputElement>(null);

  const nameTemplateForm = useForm<NameTemplateFormValues>({
    initialValues: { nameTemplate },
    validate: (values) => validateNameTemplate(values),
  });

  const eventTitleTemplateForm = useForm<EventTitleTemplateFormValues>({
    initialValues: { eventTitleTemplate },
    validate: (values) => validateEventTitleTemplate(values),
  });

  const onSubmitNameTemplate = nameTemplateForm.onSubmit(async (values) => {
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
  });

  const onSubmitEventTitleTemplate = eventTitleTemplateForm.onSubmit(async (values) => {
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
  });

  const template = nameTemplateForm.values.nameTemplate;
  const eventTitleTemplateValue = eventTitleTemplateForm.values.eventTitleTemplate;

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
  };
  const eventTitlePreview = formatEventTitle(eventTitleSample, eventTitleTemplateValue);

  return (
    <Stack>
      <Paper withBorder p="sm">
        <form onSubmit={onSubmitNameTemplate}>
          <Stack>
            <Text fw={600}>Display Name Template</Text>
            <Text size="sm" c="dimmed">
              Compose a user&apos;s fully qualified name from their name and department. The
              result is used wherever a user&apos;s full name is shown.
            </Text>

            <TextInput
              ref={templateInputRef}
              label="Template"
              description="Insert tokens to splice in the user's name and department."
              placeholder="{name}: DEPT-{department}"
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
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </form>
      </Paper>

      <Paper withBorder p="sm">
        <form onSubmit={onSubmitEventTitleTemplate}>
          <Stack>
            <Text fw={600}>Event Title Template</Text>
            <Text size="sm" c="dimmed">
              Compose the title calendar events get in Google. The raw description stays
              editable in the event form; the rendered title is what shows on the calendar.
            </Text>

            <TextInput
              ref={eventTemplateInputRef}
              label="Template"
              description="Insert tokens to build the event title."
              placeholder="{type:acronym}: {description} ({people:acronym})"
              {...eventTitleTemplateForm.getInputProps("eventTitleTemplate")}
            />

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
                      (value) => eventTitleTemplateForm.setFieldValue("eventTitleTemplate", value),
                      eventTemplateInputRef.current,
                      token,
                    )
                  }
                >
                  {token}
                </Button>
              ))}
            </Group>

            <Text size="xs" c="dimmed">
              {TYPE_STYLE_HINT}
            </Text>
            <Text size="xs" c="dimmed">
              {PEOPLE_STYLE_HINT}
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
                {sampleDepartments.join(", ") || "no departments"}
              </Text>
              <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
                {eventTitlePreview || "—"}
              </Text>
            </Stack>

            <Group justify="flex-end">
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
}
