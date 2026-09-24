"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useClipboard, useDisclosure } from "@mantine/hooks";
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconPhone,
  IconSearchOff,
  IconUsers,
} from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { FilterButton } from "@/components/FilterButton";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { PageHeader } from "@/components/PageHeader";
import { FAB_ICON_SIZE, FloatingActionButton, FloatingToolbar } from "@/components/FloatingToolbar";
import { filterContacts, NO_DEPARTMENT_FILTER } from "@/lib/contacts/filter";
import { buildContactsVcf } from "@/lib/contacts/vcf";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import type { Rect } from "@/lib/motion/origin";
import { departmentPathLabels, departmentTreeRows } from "@/lib/roster/hierarchy";
import type { RosterUser } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

/** Minimal department shape the Contacts filter needs (hierarchy-aware). */
export interface ContactDepartment {
  id: string;
  name: string;
  sortOrder: number;
  parentId: string | null;
}

interface ContactListProps {
  users: RosterUser[];
  departments: ContactDepartment[];
  nameTemplate: string;
  /** Admin: the empty state links into Settings; non-admins get a plain message. */
  isAdmin?: boolean;
}

interface CopyPhoneButtonProps {
  phone: string;
  name: string;
}

const NO_DEPARTMENT_LABEL = "No department";

function CopyPhoneButton({ phone, name }: CopyPhoneButtonProps) {
  const clipboard = useClipboard();
  return (
    <ActionIcon
      size="lg"
      variant={clipboard.copied ? "filled" : "light"}
      color={clipboard.copied ? "teal" : "brand"}
      onClick={() => clipboard.copy(phone)}
      aria-label={`Copy ${name}'s phone number`}
    >
      {clipboard.copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
    </ActionIcon>
  );
}

export function ContactList({
  users,
  departments,
  nameTemplate,
  isAdmin = false,
}: ContactListProps) {
  const [search, setSearch] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);
  const [filterOriginRect, setFilterOriginRect] = useState<Rect | null>(null);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [downloading, setDownloading] = useState(false);

  const filtered = useMemo(
    () => filterContacts(users, search, selectedDepartments),
    [users, search, selectedDepartments],
  );

  // One chip group listing only the departments that actually hold a contact,
  // labelled with the full ancestor chain ("HQ › Logistics") so the hierarchy
  // reads in the chip. A terminal chip selects contact-less members.
  const filterGroups: FilterGroup[] = useMemo(() => {
    const rows = departmentTreeRows(departments);
    const labels = departmentPathLabels(rows);
    const presentIds = new Set(
      users.map((user) => user.department?.id).filter((id): id is string => Boolean(id)),
    );
    const options = rows
      .filter((row) => presentIds.has(row.id))
      .map((row) => ({ value: row.id, label: labels.get(row.id) ?? row.name }));
    if (users.some((user) => user.department === null)) {
      options.push({ value: NO_DEPARTMENT_FILTER, label: NO_DEPARTMENT_LABEL });
    }
    return options.length > 0 ? [{ label: "Departments", options }] : [];
  }, [departments, users]);

  const departmentOptionCount = filterGroups[0]?.options.length ?? 0;
  const filterApplied =
    selectedDepartments.length > 0 && selectedDepartments.length < departmentOptionCount;
  const activeFilterCount = filterApplied ? 1 : 0;
  const isNarrowed = search.trim() !== "" || filterApplied;

  const filterValues: Record<string, string[]> = useMemo(
    () => ({ Departments: selectedDepartments }),
    [selectedDepartments],
  );

  function handleApplyFilters(values: Record<string, string[]>) {
    setSelectedDepartments(values["Departments"] ?? []);
  }

  function clearFilters() {
    setSearch("");
    setSelectedDepartments([]);
  }

  async function downloadVcf() {
    setDownloading(true);
    try {
      // Respect the active search + filters: what you see is what you get.
      const vcf = buildContactsVcf(
        filtered.map((user) => ({
          name: user.name,
          departmentName: user.department?.name ?? null,
          phone: user.phone,
        })),
        nameTemplate,
      );
      const blob = new Blob([vcf], { type: "text/vcard" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "contacts.vcf";
      anchor.click();
      URL.revokeObjectURL(url);
      closeConfirm();
    } finally {
      setDownloading(false);
    }
  }

  return (
    // fab-page-pad replaces pb="xl": reserves clearance for the mobile
    // export FAB below the last contact card, restores plain xl at lg.
    <Stack className={`${CONTENT_ENTER_CLASS} fab-page-pad`}>
      <PageHeader
        title="Contacts"
        subtitle="Roster directory — call, copy, or export contact details."
      />
      <Paper withBorder p="sm">
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <TextInput
            aria-label="Search contacts by name, shortname, or phone"
            placeholder="Search by name, shortname, or phone"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          {filterGroups.length > 0 && (
            <FilterButton
              activeCount={activeFilterCount}
              onClick={(event) => {
                setFilterOriginRect(event.currentTarget.getBoundingClientRect());
                openFilter();
              }}
            />
          )}
          {/* Desktop: full-size export button instead of the FAB (like the
              settings tabs' "Add ..." buttons); the FAB below is mobile-only. */}
          <Button
            visibleFrom="lg"
            __vars={{ "--button-height": "43px" }}
            leftSection={<IconDownload size={16} />}
            onClick={openConfirm}
          >
            Export contacts
          </Button>
        </Group>
      </Paper>

      {filtered.length === 0 ? (
        isNarrowed ? (
          <EmptyState
            icon={<IconSearchOff size={18} />}
            description={
              filterApplied ? "No contacts match your filters." : "No contacts match your search."
            }
            actionLabel={filterApplied ? "Clear search & filters" : "Clear search"}
            onAction={clearFilters}
          />
        ) : isAdmin ? (
          <EmptyState
            icon={<IconUsers size={18} />}
            description="No contacts found."
            actionLabel="Manage users"
            actionHref="/settings/users"
          />
        ) : (
          <EmptyState icon={<IconUsers size={18} />} description="No contacts found." />
        )
      ) : (
        <Box component="div" className="card-grid">
          {filtered.map((user) => (
            <Paper key={user.id} withBorder p="sm" className="c2-defer-render">
              <Stack gap={0}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={0}>
                    <Group gap={6} wrap="nowrap">
                      <Text fw={600}>{user.name}</Text>
                      {user.shortname ? (
                        <Text size="sm" c="dimmed">
                          {user.shortname}
                        </Text>
                      ) : null}
                    </Group>
                    <Text size="sm" c="dimmed">
                      {formatFullName(
                        { name: user.name, departmentName: user.department?.name ?? null },
                        nameTemplate,
                      )}
                    </Text>
                  </Stack>
                  <Group gap={6} wrap="nowrap">
                    <CopyPhoneButton phone={user.phone} name={user.name} />
                    <Anchor
                      href={`tel:${user.phone}`}
                      underline="never"
                      c="brand"
                      aria-label={`Call ${user.name}`}
                    >
                      <ActionIcon size="lg" variant="filled" color="brand" component="span">
                        <IconPhone size={18} />
                      </ActionIcon>
                    </Anchor>
                  </Group>
                </Group>
                <Group gap={6} wrap="wrap" mt={4}>
                  <Text size="sm" c="dimmed">
                    {user.phone}
                  </Text>
                  <Badge color={user.role === "admin" ? "brand" : "gray"}>
                    {user.role === "admin" ? "Admin" : "User"}
                  </Badge>
                  {user.department ? (
                    <Badge variant="light" color="accent">
                      {user.department.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" color="gray">
                      No department
                    </Badge>
                  )}
                </Group>
              </Stack>
            </Paper>
          ))}
        </Box>
      )}

      {/* Mobile-only: at lg the "Export contacts" button in the search bar
          replaces the FAB. hiddenFrom sits on the toolbar itself: its Affix
          portals to <body>, so a wrapper element could not hide it. */}
      <FloatingToolbar hiddenFrom="lg">
        <FloatingActionButton aria-label="Export contacts" onClick={openConfirm}>
          <IconDownload size={FAB_ICON_SIZE} style={{ position: "relative", top: 2 }} />
        </FloatingActionButton>
      </FloatingToolbar>

      <FilterModal
        opened={filterOpened}
        onClose={closeFilter}
        title="Filter contacts"
        groups={filterGroups}
        values={filterValues}
        onApply={handleApplyFilters}
        originRect={filterOriginRect}
        hint="Filters combine with the search box."
      />

      <Modal
        opened={confirmOpened}
        onClose={closeConfirm}
        title="Export contacts"
        centered
        size="sm"
      >
        <Text>
          Download {filtered.length} contact{filtered.length === 1 ? "" : "s"} as a .vcf file
          {isNarrowed ? " (current search & filters only)" : ""}?
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeConfirm}>
            Cancel
          </Button>
          <Button
            color="brand"
            loading={downloading}
            loaderProps={BUTTON_LOADER_PROPS}
            leftSection={<IconDownload size={16} />}
            onClick={downloadVcf}
          >
            Download
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
