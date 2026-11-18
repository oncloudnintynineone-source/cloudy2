"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "@mantine/form";
import {
  Badge,
  Button,
  Divider,
  Grid,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";

import { MotionModal } from "@/components/MotionModal";
import { AccessLevelSelect, AccessRow } from "@/components/AccessRows";
import { PickerField, type PickerBadgeItem } from "@/components/PickerField";
import { UserSelectModal } from "@/components/UserSelectModal";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";
import {
  createUser,
  getAssignedAccessRole,
  setUserStatus,
  updateUser,
  type RosterActionResult,
} from "@/lib/roster/actions";
import {
  addableDepartmentIds,
  nextGrantsAfterAdd,
  removeGrant,
  resolveOwnRolePatch,
  setGrantRole,
} from "@/lib/roster/accessEditor";
import type { RosterAccessGrant, RosterUser } from "@/lib/roster/queries";
import type { ManagedGrantRole } from "@/lib/roster/shares";
import { departmentTreeRows } from "@/lib/roster/hierarchy";
import { validateUserForm, type UserFormValues, type UserRole } from "@/lib/roster/validate";
import {
  departmentPickerOptions,
  selectionByGroup,
  type PickerGroup,
} from "@/lib/users/userSelect";

/**
 * The add/edit-user dialog body.
 *
 * Everything in it is **staged and applied on Save** — including the level of
 * the user's own department, which is a raw Google ACL override rather than a
 * column (see `docs/roster-sharing.md` §1.5). An earlier revision wrote that
 * one override straight to Google the moment it was picked, which made a single
 * form half-draft, half-live: closing lost the grants but not the level.
 */

/** The department a user can be assigned to (the server page's projection). */
export interface DepartmentOption {
  id: string;
  name: string;
  /** The department's display order (calendars.sort_order), for tree building. */
  sortOrder?: number;
  /** The department's parent department id (calendars.parent_id), for nesting. */
  parentId: string | null;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

interface UserFormProps {
  user: RosterUser | null;
  departments: DepartmentOption[];
  /** The user's current cross-department grants (from the server, per user). */
  access: RosterAccessGrant[];
  /**
   * Reports whether the form holds unsaved edits. The dialog lives in the
   * parent, so the parent decides what closing means (and asks first).
   */
  onDirtyChange?: (dirty: boolean) => void;
  onDone: () => void;
}

function initialValues(user: RosterUser | null, access: RosterAccessGrant[]): UserFormValues {
  const grants: UserFormValues["access"] = access.map((grant) => ({
    calendarId: grant.calendarId,
    role: grant.role,
  }));
  const base: UserFormValues = {
    name: user?.name ?? "",
    shortname: user?.shortname ?? "",
    phone: user?.phone ?? "",
    email: user?.email ?? "",
    birthday: user?.birthday ?? "",
    role: user?.role ?? "user",
    status: user?.status ?? "active",
    departmentId: user?.department?.id ?? null,
    access: grants,
    // Never seeded from the live ACL: the row shows the live level, and only an
    // explicit pick counts as a change to write.
    ownDepartmentRole: null,
  };
  return base;
}

/**
 * The live ACL level of the user's own department, as far as it is known. A read
 * in flight is not a state of its own: it is simply "no result for this key yet"
 * (see `ownRoleBusy`), which keeps the effect free of a cascading setState.
 */
type OwnRoleRead =
  | { key: string; status: "ready"; role: ManagedGrantRole }
  | { key: string; status: "failed" };

export function UserForm({ user, departments, access, onDirtyChange, onDone }: UserFormProps) {
  const isEdit = user !== null;
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
  const [grantPickerOpen, setGrantPickerOpen] = useState(false);
  const [ownRead, setOwnRead] = useState<OwnRoleRead | null>(null);

  const form = useForm<UserFormValues>({
    // The parent remounts this component (key) when the target user changes,
    // so initialValues are computed once per mount and stay correct.
    initialValues: initialValues(user, access),
    validate: (values) => validateUserForm(values),
    // Validate as soon as a field loses focus: the inline error appears
    // without waiting for a submit (errors clear on the next edit).
    validateInputOnBlur: true,
  });

  // Stable identity while the staged list is unchanged — `?? []` alone would hand
  // a fresh array to every render and defeat the memos below.
  const granted = useMemo(() => form.values.access ?? [], [form.values.access]);
  const selectedDepartmentId = form.values.departmentId;
  const emailDraft = (form.values.email ?? "").trim();
  const savedDepartmentId = user?.department?.id ?? null;
  const departmentChanged = isEdit && selectedDepartmentId !== savedDepartmentId;

  // The parent owns the dialog, so it learns about unsaved edits from here —
  // including the reset to false when the form remounts for another target.
  // `isDirty()` is read during render: Mantine updates its dirty state with
  // every value change, so this re-renders and the boolean is always current.
  const dirty = form.isDirty();
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const onSubmit = form.onSubmit(
    async (values) => {
      // The own-department level is only sent when it is an actual change, so
      // the server never writes an ACL the admin did not ask for.
      const ownDepartmentRole = resolveOwnRolePatch({
        seededRole: ownRead?.status === "ready" ? ownRead.role : null,
        stagedRole: values.ownDepartmentRole ?? null,
        hasEmail: (values.email ?? "").trim() !== "",
        departmentChanged,
      });
      const payload = { ...values, ownDepartmentRole };

      const result: RosterActionResult = isEdit
        ? await updateUser(user.id, payload)
        : await createUser(payload);

      if (result.ok) {
        const message = isEdit ? "User updated" : "User created";
        if (result.warnings && result.warnings.length > 0) {
          notifications.show({
            color: "yellow",
            title: message,
            message: result.warnings.join(" · "),
          });
        } else {
          notifications.show({ color: "green", message });
        }
        onDone();
        return;
      }

      if (result.field === "phone") {
        form.setFieldError("phone", result.error);
      }
      if (result.field === "shortname") {
        form.setFieldError("shortname", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    // Client-side validation failure: inline field errors alone are easy to
    // miss (submit button is far from the invalid fields), so also toast and
    // scroll the first invalid field into view.
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  async function handleToggleStatus() {
    if (!isEdit || !user || togglingStatus) return;
    const next = user.status === "active" ? "inactive" : "active";
    setTogglingStatus(true);
    try {
      const result = await setUserStatus(user.id, next);
      closeConfirm();
      if (result.ok) {
        notifications.show({
          color: "green",
          message: next === "active" ? "User activated" : "User deactivated",
        });
        onDone();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setTogglingStatus(false);
    }
  }

  // The whole department list as tree rows in preorder. Labels carry the full
  // ancestor chain ("HQ › Logistics"), so a row or a picker pill shows the
  // hierarchy inline instead of relying on indentation.
  const departmentRows = useMemo(
    () =>
      departmentTreeRows(
        departments.map((department) => ({
          id: department.id,
          name: department.name,
          sortOrder: department.sortOrder ?? 0,
          parentId: department.parentId,
        })),
      ),
    [departments],
  );
  const departmentOptions = useMemo(
    () => departmentPickerOptions(departmentRows),
    [departmentRows],
  );
  /** Department ids in display order — the order staged grant rows keep. */
  const orderedDepartmentIds = useMemo(() => departmentRows.map((row) => row.id), [departmentRows]);
  // A grant whose department has since been deleted still has to read as
  // something: fall back to the name the server carried, then to the id.
  const staleGrantNames = useMemo(() => {
    const known = new Set(departments.map((department) => department.id));
    return new Map(
      access
        .filter((grant) => !known.has(grant.calendarId))
        .map((grant) => [grant.calendarId, grant.name]),
    );
  }, [access, departments]);

  /** Display label for a department id (ancestor chain, stale name, or the id). */
  function departmentLabel(calendarId: string): string {
    const option = departmentOptions.find((candidate) => candidate.id === calendarId);
    return option?.label ?? staleGrantNames.get(calendarId) ?? calendarId;
  }

  // --- Department (their own) -------------------------------------------------

  const departmentSummary: PickerBadgeItem[] = selectedDepartmentId
    ? [{ key: selectedDepartmentId, label: departmentLabel(selectedDepartmentId), color: "brand" }]
    : [];
  const departmentPickerGroups = useMemo<PickerGroup[]>(
    () => [{ label: "Departments", options: departmentOptions }],
    [departmentOptions],
  );
  const departmentPickerValues = useMemo(
    () =>
      selectionByGroup(departmentPickerGroups, selectedDepartmentId ? [selectedDepartmentId] : []),
    [departmentPickerGroups, selectedDepartmentId],
  );

  /**
   * The selected department becomes their own: any grant for it is dropped (it
   * would be a no-op the server strips anyway) and a level picked for the
   * previous department is discarded — it belongs to a different calendar.
   */
  function selectDepartment(departmentId: string | null) {
    if (departmentId !== selectedDepartmentId) {
      form.setFieldValue("ownDepartmentRole", null);
    }
    form.setFieldValue("departmentId", departmentId);
    if (departmentId && granted.some((grant) => grant.calendarId === departmentId)) {
      form.setFieldValue("access", removeGrant(granted, departmentId));
    }
  }

  // --- Their own department's level -------------------------------------------

  // Its live level is only readable for an existing membership: same department
  // as saved, and an email to look up. The email is debounced so typing it does
  // not fire a read per keystroke; the row itself enables on the first character.
  const [debouncedEmail] = useDebouncedValue(emailDraft, 400);
  const ownFetchKey =
    isEdit && !departmentChanged && debouncedEmail && selectedDepartmentId
      ? `${selectedDepartmentId}|${debouncedEmail}`
      : null;
  // A target change is a render-phase reset (never an effect), so no cascade —
  // and it makes "a read for this key is in flight" exactly "no result yet",
  // which is why loading is derived here instead of stored as a state.
  if (ownRead !== null && ownRead.key !== ownFetchKey) {
    setOwnRead(null);
  }
  const ownRoleBusy = ownFetchKey !== null && ownRead === null;

  useEffect(() => {
    if (ownFetchKey === null || ownRead?.key === ownFetchKey) {
      return;
    }
    const separator = ownFetchKey.indexOf("|");
    const departmentId = ownFetchKey.slice(0, separator);
    const email = ownFetchKey.slice(separator + 1);
    let active = true;
    getAssignedAccessRole(departmentId, email)
      .then((role) => {
        if (!active) return;
        setOwnRead(
          role === null
            ? { key: ownFetchKey, status: "failed" }
            : { key: ownFetchKey, status: "ready", role },
        );
      })
      .catch(() => {
        if (active) {
          setOwnRead({ key: ownFetchKey, status: "failed" });
        }
      });
    return () => {
      active = false;
    };
  }, [ownFetchKey, ownRead]);

  const stagedOwnRole = form.values.ownDepartmentRole ?? null;
  /** What the row shows: an explicit pick, else the live level, else the default. */
  const ownRoleValue = stagedOwnRole ?? (ownRead?.status === "ready" ? ownRead.role : "reader");
  const ownHint = !emailDraft
    ? "Add an email address — Google Calendar shares calendars by email."
    : ownRead?.status === "failed"
      ? "Couldn't read their current level — pick one to set it."
      : departmentChanged
        ? "Not their department yet — the level is applied when you save the move."
        : null;

  // --- Cross-department grants ------------------------------------------------

  /** Departments the dialog may offer: not their own, not already granted. */
  const addableIds = useMemo(
    () => addableDepartmentIds(orderedDepartmentIds, selectedDepartmentId, granted),
    [orderedDepartmentIds, selectedDepartmentId, granted],
  );
  const grantPickerGroups = useMemo<PickerGroup[]>(
    () => [
      {
        label: "Departments",
        options: departmentOptions.filter((option) => addableIds.includes(option.id)),
      },
    ],
    [departmentOptions, addableIds],
  );
  // Always an empty draft: the dialog adds, it never re-presents the rows.
  const grantPickerValues = useMemo(
    () => selectionByGroup(grantPickerGroups, []),
    [grantPickerGroups],
  );

  /** Confirmed in the dialog: every picked department becomes a reader row. */
  function addGrants(values: Record<string, string[]>) {
    const ids = Object.values(values).flat();
    if (ids.length === 0) return;
    form.setFieldValue("access", nextGrantsAfterAdd(granted, ids, orderedDepartmentIds));
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        {/* At lg the modal is wide enough for a two-column field grid. */}
        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <TextInput
              label="Name"
              required
              placeholder="Full name"
              {...form.getInputProps("name")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <TextInput
              label="Shortname"
              required
              placeholder="e.g. ALICE"
              {...form.getInputProps("shortname")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <TextInput
              label="Phone"
              required
              placeholder="8-digit number"
              {...form.getInputProps("phone")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <TextInput
              label="Email"
              placeholder="Optional — needed for calendar access"
              inputMode="email"
              {...form.getInputProps("email")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            {/* A calendar popover, never a native date input: the readOnly input
                keeps the mobile keyboard down (the app's dropdown rule). */}
            <DatePickerInput
              label="Birthday"
              placeholder="Optional"
              clearable
              valueFormat="YYYY-MM-DD"
              value={form.values.birthday || null}
              onChange={(value) => form.setFieldValue("birthday", value ?? "")}
              attributes={{ input: { readOnly: true } }}
            />
          </Grid.Col>
        </Grid>

        <Stack gap={4}>
          <Text fw={500} size="sm">
            Role
          </Text>
          <SegmentedControl
            aria-label="Role"
            data={ROLE_OPTIONS}
            value={form.values.role}
            onChange={(value) => form.setFieldValue("role", value)}
          />
          <Text size="xs" c="dimmed">
            Admins manage settings, users and departments. Everyone else only gets the calendar.
          </Text>
        </Stack>

        {departments.length === 0 ? (
          <Stack gap={4}>
            <Text fw={500} size="sm">
              Department
            </Text>
            <Text size="sm" c="dimmed">
              No departments yet — create one under Settings → Departments.
            </Text>
          </Stack>
        ) : (
          <PickerField
            label="Department"
            description="Their own department: members see its calendar automatically."
            items={departmentSummary}
            empty={
              <Text size="sm" c="dimmed">
                No department
              </Text>
            }
            triggerLabel="Select"
            onOpen={() => setDepartmentPickerOpen(true)}
          />
        )}

        {departmentPickerOpen && (
          <UserSelectModal
            opened
            onClose={() => setDepartmentPickerOpen(false)}
            title="Department"
            confirmLabel="Select"
            groups={departmentPickerGroups}
            values={departmentPickerValues}
            onConfirm={(values) => selectDepartment(Object.values(values).flat()[0] ?? null)}
            single
            allowEmptyConfirm
            zIndex={300}
          />
        )}

        {/* Department access: what this user sees in Google Calendar. Their own
            department is always the first row and can never be removed (that
            would mean removing them from it, which is the Department field's
            job); the extra departments below can. Nothing here is written until
            Save — including the own-department level. */}
        <Divider label="Department access" labelPosition="left" my="sm" />
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Grants change what this user sees in Google Calendar — never the filters in the app.
            Everything here is applied when you save.
          </Text>

          {selectedDepartmentId ? (
            <AccessRow
              title={departmentLabel(selectedDepartmentId)}
              badge={
                <Badge size="xs" variant="light" color="accent">
                  Their department
                </Badge>
              }
              subtitle={ownHint}
              trailing={
                <AccessLevelSelect
                  ariaLabel={`Access level for ${departmentLabel(selectedDepartmentId)}`}
                  value={ownRoleValue}
                  loading={ownRoleBusy}
                  disabled={emailDraft === "" || ownRoleBusy}
                  onChange={(role) => form.setFieldValue("ownDepartmentRole", role)}
                />
              }
            />
          ) : null}

          {granted.map((grant) => (
            <AccessRow
              key={grant.calendarId}
              title={departmentLabel(grant.calendarId)}
              trailing={
                <AccessLevelSelect
                  ariaLabel={`Access level for ${departmentLabel(grant.calendarId)}`}
                  value={grant.role}
                  onChange={(role) =>
                    form.setFieldValue("access", setGrantRole(granted, grant.calendarId, role))
                  }
                />
              }
              onRemove={() => form.setFieldValue("access", removeGrant(granted, grant.calendarId))}
              removeAriaLabel={`Remove access to ${departmentLabel(grant.calendarId)}`}
            />
          ))}

          {granted.length === 0 ? (
            <Text size="sm" c="dimmed">
              No extra departments — they only see their own.
            </Text>
          ) : null}

          {addableIds.length > 0 ? (
            <Button
              type="button"
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setGrantPickerOpen(true)}
            >
              Add departments
            </Button>
          ) : (
            <Text size="xs" c="dimmed">
              Every department is already on this user.
            </Text>
          )}

          {grantPickerOpen && (
            <UserSelectModal
              opened
              onClose={() => setGrantPickerOpen(false)}
              title="Department access"
              confirmLabel="Add"
              groups={grantPickerGroups}
              values={grantPickerValues}
              onConfirm={addGrants}
              zIndex={300}
            />
          )}
        </Stack>

        <Group justify="flex-end" mt="md" wrap="nowrap">
          {isEdit && (
            <Button
              type="button"
              color={user.status === "active" ? "red" : "teal"}
              variant="light"
              onClick={openConfirm}
            >
              {user.status === "active" ? "Deactivate user" : "Activate user"}
            </Button>
          )}
          <Button
            type="submit"
            fullWidth={!isEdit}
            loading={form.submitting}
            loaderProps={BUTTON_LOADER_PROPS}
          >
            {isEdit ? "Save changes" : "Create user"}
          </Button>
        </Group>

        <MotionModal
          opened={confirmOpened}
          onClose={closeConfirm}
          title={isEdit && user.status === "active" ? "Deactivate user" : "Activate user"}
          centered
          size="sm"
        >
          <Stack>
            <Text>
              Are you sure you want to {user?.status === "active" ? "deactivate" : "activate"}{" "}
              {user?.name}?
            </Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeConfirm}>
                Cancel
              </Button>
              <Button
                color={user?.status === "active" ? "red" : "teal"}
                loading={togglingStatus}
                loaderProps={BUTTON_LOADER_PROPS}
                onClick={handleToggleStatus}
              >
                Confirm
              </Button>
            </Group>
          </Stack>
        </MotionModal>
      </Stack>
    </form>
  );
}
