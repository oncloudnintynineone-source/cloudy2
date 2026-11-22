"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Affix,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useClipboard, useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconBuildingArch,
  IconCheck,
  IconCopy,
  IconDownload,
  IconPhone,
  IconSearchOff,
  IconSortAZ,
  IconUsers,
} from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { FilterButton } from "@/components/FilterButton";
import { FilterModal, type FilterGroup } from "@/components/FilterModal";
import { PageHeader } from "@/components/PageHeader";
import { FAB_SIZE } from "@/components/FloatingToolbar";
import { filterContacts, NO_DEPARTMENT_FILTER } from "@/lib/contacts/filter";
import {
  activeSectionKey,
  buildContactRail,
  buildContactSections,
  contactInitial,
  CONTACT_RAIL_ENTRY_HEIGHT_PX,
  CONTACT_RAIL_PADDING_Y_PX,
  contactRailHeightPx,
  type ContactSort,
} from "@/lib/contacts/sections";
import { useChromeHide } from "@/lib/ui/chromeHide";
import { announce } from "@/lib/ui/announcer";
import { useKeyboardInset } from "@/lib/ui/keyboardInset";
import { buildContactsVcf } from "@/lib/contacts/vcf";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import type { Rect } from "@/lib/motion/origin";
import { departmentPathLabels, departmentTreeRows } from "@/lib/roster/hierarchy";
import type { RosterUser } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { DESKTOP_MEDIA_QUERY } from "@/lib/theme";

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

/** Rail sections below this count don't need a jump affordance. */
const RAIL_MIN_SECTIONS = 4;

const LIST_BORDER = "1px solid var(--mantine-color-default-border)";

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

/**
 * One dense contact row (C2): the old bordered card printed the name twice
 * (raw + template) and wasted a card's padding per person; a phone list is a
 * lookup tool, so rows ride hairline separators in one bordered container —
 * template name + shortname, then phone + department/role chips, with copy
 * and call pinned right.
 */
function ContactRow({ user, nameTemplate }: { user: RosterUser; nameTemplate: string }) {
  const displayName = formatFullName(
    { name: user.name, departmentName: user.department?.name ?? null },
    nameTemplate,
  );
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      className="c2-defer-render"
      style={{ padding: "10px var(--mantine-spacing-sm)" }}
    >
      <Box style={{ minWidth: 0, flex: 1 }}>
        <Group gap={6} wrap="nowrap">
          <Text fw={600} size="sm" truncate>
            {displayName}
          </Text>
          {user.shortname ? (
            <Text size="xs" c="dimmed" truncate>
              {user.shortname}
            </Text>
          ) : null}
        </Group>
        <Group gap={6} wrap="wrap" mt={2}>
          <Text size="xs" c="dimmed">
            {user.phone}
          </Text>
          {user.department ? (
            <Badge size="xs" variant="light" color="accent" className="c2-contact-dept">
              {user.department.name}
            </Badge>
          ) : (
            <Badge size="xs" variant="outline" color="gray">
              {NO_DEPARTMENT_LABEL}
            </Badge>
          )}
          <Badge size="xs" variant={user.role === "admin" ? "light" : "outline"} color={user.role === "admin" ? "brand" : "gray"}>
            {user.role === "admin" ? "Admin" : "User"}
          </Badge>
        </Group>
      </Box>
      <Group gap={6} wrap="nowrap">
        <CopyPhoneButton phone={user.phone} name={user.name} />
        <Anchor href={`tel:${user.phone}`} underline="never" c="brand" aria-label={`Call ${user.name}`}>
          <ActionIcon size="lg" variant="filled" color="brand" component="span">
            <IconPhone size={18} />
          </ActionIcon>
        </Anchor>
      </Group>
    </Group>
  );
}

export function ContactList({
  users,
  departments,
  nameTemplate,
  isAdmin = false,
}: ContactListProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ContactSort>("name");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);
  const [filterOriginRect, setFilterOriginRect] = useState<Rect | null>(null);
  // lg+ keeps the search/filter bar in the sticky top chrome; below `lg` the
  // controls move to the floating bottom pill (calendar-page pattern).
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  // Keyboard-driven lift: the pill floats up to just above the OS keyboard while
  // it is up (measured from `visualViewport`, not a guessed `vh` fraction), and
  // drops back the moment the keyboard closes — even if the search field keeps
  // focus (swipe-down dismiss never fires `blur`). Tapping the pill's
  // filter/export circles doesn't reliably blur a focused input on mobile, so
  // those handlers blur it explicitly (see `searchInputRef`) to close the
  // keyboard and let the pill settle back down.
  const keyboardInset = useKeyboardInset();
  const searchInputRef = useRef<HTMLInputElement>(null);
  // The mobile floating control pill hides while the user touches or scrolls
  // the contact list and slides back when the interaction fully stops — the
  // page column is the pane; the pill is `Affix`-portaled, so tapping its
  // search/filter/export controls can't self-trigger. Mobile only (`enabled`
  // detaches at `lg`+).
  const contentRef = useRef<HTMLDivElement | null>(null);
  const chromeHidden = useChromeHide({ enabled: !isDesktop, paneRef: contentRef });
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [downloading, setDownloading] = useState(false);

  const filtered = useMemo(
    () => filterContacts(users, search, selectedDepartments),
    [users, search, selectedDepartments],
  );

  // Sectioning + jump rail (C2): alphabetical by name, or grouped by
  // department; the rail lists one letter per section initial.
  const sections = useMemo(() => buildContactSections(filtered, sort), [filtered, sort]);
  const rail = useMemo(() => buildContactRail(sections), [sections]);
  const showRail = rail.length >= RAIL_MIN_SECTIONS;
  const [activeRailKey, setActiveRailKey] = useState<string | null>(null);

  // Keep the rail's highlight on the section under the activation line (the
  // upper third of the viewport). Capture-phase `scroll` on `document`: the
  // page may scroll on the window or on an inner container, and every scroll
  // event reaches `document` during capture either way. The first measurement
  // rides a frame so the effect body itself never sets state.
  useEffect(() => {
    if (!showRail) {
      return;
    }
    const measure = () => {
      const entries = sections.flatMap((section) => {
        const el = document.getElementById(`c2-contact-section-${section.key}`);
        return el
          ? [{ key: contactInitial(section.label), top: el.getBoundingClientRect().top }]
          : [];
      });
      setActiveRailKey(activeSectionKey(entries, Math.min(280, window.innerHeight * 0.35)));
    };
    const frame = window.requestAnimationFrame(measure);
    document.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [sections, showRail]);

  function changeSort(next: ContactSort) {
    if (next === sort) {
      return;
    }
    setSort(next);
    announce(next === "name" ? "Contacts sorted by name" : "Contacts sorted by department");
  }

  function jumpToSection(sectionKey: string, label: string) {
    const target = document.getElementById(`c2-contact-section-${sectionKey}`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    announce(`Jumped to contacts ${label}`);
  }

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

  // The sort menu (C2): name ↔ department. The trigger icon mirrors the
  // active sort so the control reads its own state at a glance.
  const sortMenuItems = (
    <Menu.Dropdown>
      <Menu.Label>Sort contacts</Menu.Label>
      <Menu.Item
        leftSection={sort === "name" ? <IconCheck size={14} /> : undefined}
        onClick={() => changeSort("name")}
      >
        By name
      </Menu.Item>
      <Menu.Item
        leftSection={sort === "department" ? <IconCheck size={14} /> : undefined}
        onClick={() => changeSort("department")}
      >
        By department
      </Menu.Item>
    </Menu.Dropdown>
  );
  const sortAriaLabel = `Sort contacts — currently ${sort === "name" ? "by name" : "by department"}`;

  // The floating control pill (below `lg` only, calendar-page pattern): a
  // rounded search field (flexible width) + the circular sort, filter and
  // download triggers, inset 16px from the viewport edges. (The old standalone
  // export FAB is gone — the download circle rides inside the pill.) While the
  // OS keyboard is up it covers the bottom of the screen, so the pill lifts to
  // the measured keyboard top plus a 16px gap — a fixed `vh` fraction
  // overshoots on devices whose viewport doesn't shrink with the keyboard.
  const pillHeightPx = 58;
  const mobilePill = (
    <Affix
      hiddenFrom="lg"
      className="c2-pill-lift"
      position={{
        bottom:
          keyboardInset > 0
            ? `calc(${keyboardInset}px + 16px)`
            : "var(--app-floating-bottom-offset)",
        left: 16,
        right: 16,
      }}
      zIndex={100}
    >
      {/* `c2-chrome-hide-able` + `c2-chrome-hidden`: the pill fades/slides away
          while the user touches or scrolls the contact list and returns when
          the interaction stops (useChromeHide); the CSS carries the
          pointer-events cutoff so a hidden pill never catches taps. */}
      <Box
        className={`c2-glass-surface c2-control-pill c2-chrome-hide-able${
          chromeHidden ? " c2-chrome-hidden" : ""
        }`}
      >
        <Group align="center" gap="xs" wrap="nowrap">
          {/* Default `sm` size = the themed 43px input height (same field
              height as the lg+ search bar); `h`/`pl`/`pr` would land on the
              label wrapper, not the input, so they'd desync the field from
              the pill's padding. The filter circle grows to match (44px). */}
          <TextInput
            ref={searchInputRef}
            radius="999px"
            aria-label="Search contacts by name, shortname, or phone"
            placeholder="Search by name, shortname, or phone"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <Menu shadow="md" width={200} position="top" withArrow>
            <Menu.Target>
              <ActionIcon
                size={44}
                radius="50%"
                variant="default"
                className="c2-glass-btn"
                aria-label={sortAriaLabel}
                title={sortAriaLabel}
                onClick={() => searchInputRef.current?.blur()}
              >
                {sort === "name" ? <IconSortAZ size={20} /> : <IconBuildingArch size={20} />}
              </ActionIcon>
            </Menu.Target>
            {sortMenuItems}
          </Menu>
          {filterGroups.length > 0 && (
            <FilterButton
              activeCount={activeFilterCount}
              onClick={(event) => {
                searchInputRef.current?.blur();
                setFilterOriginRect(event.currentTarget.getBoundingClientRect());
                openFilter();
              }}
              size={44}
              iconSize={20}
              radius="50%"
              className="c2-glass-btn"
            />
          )}
          {/* Export/download trigger: the FAB's action moved into the pill
              as a brand-blue circle beside the filter (frosted tint like the
              pill's other buttons, solid identity kept via the brand hue). */}
          <ActionIcon
            size={44}
            radius="50%"
            variant="default"
            className="c2-glass-btn c2-glass-fab--brand"
            aria-label="Export contacts"
            onClick={() => {
              searchInputRef.current?.blur();
              openConfirm();
            }}
          >
            <IconDownload size={20} />
          </ActionIcon>
        </Group>
      </Box>
    </Affix>
  );

  return (
    // fab-page-pad replaces pb="xl": reserves clearance for the floating
    // control pill below the last contact row, restores plain xl at lg.
    // The class hardcodes the 65px FAB diameter in its pad; this page has no
    // FAB row anymore, so the var subtracts it and carries just the pill
    // height + the 12px gap.
    <Stack
      ref={contentRef}
      className={`${CONTENT_ENTER_CLASS} fab-page-pad`}
      style={
        {
          "--c2-bottom-chrome-height": isDesktop
            ? "0px"
            : `${pillHeightPx + 12 - FAB_SIZE}px`,
        } as CSSProperties
      }
    >
      <PageHeader
        title="Contacts"
        subtitle="Roster directory — call, copy, or export contact details."
      />
      {/* The pinned chrome (lg+ only): search/sort/filter/export bar stuck under
          the app header while the contact rows scroll beneath it — the shared
          sticky-chrome recipe (docs/dashboard-views.md, SettingsTabs):
          frosted glass surface, gutter bleed, direct child of the page
          column. Below lg the search + sort + filter move to the floating
          bottom pill, so this chrome disappears. */}
      {isDesktop && (
        <Box
          className="c2-glass-surface"
          style={{
            position: "sticky",
            top: "var(--app-shell-header-offset)",
            zIndex: 9,
            borderBottom: "1px solid var(--mantine-color-default-border)",
            marginInline: "calc(-1 * var(--app-shell-padding))",
            marginTop: "calc(-1 * var(--app-shell-padding))",
            paddingInline: "var(--app-shell-padding)",
            paddingTop: "var(--mantine-spacing-md)",
            paddingBottom: "var(--mantine-spacing-md)",
          }}
        >
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <TextInput
              aria-label="Search contacts by name, shortname, or phone"
              placeholder="Search by name, shortname, or phone"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Button
                  __vars={{ "--button-height": "43px" }}
                  variant="default"
                  leftSection={
                    sort === "name" ? <IconSortAZ size={16} /> : <IconBuildingArch size={16} />
                  }
                  aria-label={sortAriaLabel}
                >
                  {sort === "name" ? "Name" : "Department"}
                </Button>
              </Menu.Target>
              {sortMenuItems}
            </Menu>
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
                settings tabs' "Add ..." buttons); the pill circle below is
                mobile-only. */}
            <Button
              __vars={{ "--button-height": "43px" }}
              leftSection={<IconDownload size={16} />}
              onClick={openConfirm}
            >
              Export contacts
            </Button>
          </Group>
        </Box>
      )}

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
        // Sectioned dense list (C2): every group is its own rounded card — the
        // letter groups for the name sort, the department groups for the
        // department sort — so a group reads as one bounded block instead of a
        // seam in a continuous list. Groups stay one per row (a grid of
        // unevenly sized groups would leave ragged gaps); the **rows inside**
        // each card flow into `.c2-contact-rows` columns on wide screens, which
        // is what uses the extra width. The A–Z rail rides beside the cards as
        // a sticky surface: vertically centred in the viewport while the list
        // scrolls (see `.c2-contact-rail`), lighting up the current section,
        // with full tap targets per letter.
        <Box style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
            {sections.map((section) => (
              <Box
                key={section.key}
                id={`c2-contact-section-${section.key}`}
                className="c2-contact-section"
                style={{
                  border: LIST_BORDER,
                  borderRadius: "var(--mantine-radius-md)",
                  overflow: "hidden",
                }}
              >
                <Box
                  style={{
                    padding: "6px var(--mantine-spacing-sm)",
                    borderBottom: LIST_BORDER,
                  }}
                >
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" lh={1}>
                    {section.label}
                  </Text>
                </Box>
                {/* Rows flow into auto-filling columns on wide screens; each
                    cell draws its own hairline, so a partially filled last row
                    stays the page colour (see `.c2-contact-rows`). */}
                <Box component="div" className="c2-contact-rows">
                  {section.users.map((user) => (
                    <Box key={user.id} className="c2-contact-row">
                      <ContactRow user={user} nameTemplate={nameTemplate} />
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Stack>
          {showRail && (
            <Box
              component="nav"
              aria-label="Jump to contacts section"
              className="c2-contact-rail"
              style={
                {
                  position: "sticky",
                  // A stretched flex item cannot stick, so the rail keeps its
                  // own height and `.c2-contact-rail` centres it in the
                  // viewport from the height declared below.
                  alignSelf: "flex-start",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: `${CONTACT_RAIL_PADDING_Y_PX}px 3px`,
                  zIndex: 2,
                  background: "var(--mantine-color-default)",
                  border: LIST_BORDER,
                  borderRadius: 999,
                  // CSS centres the sticky rail (`50dvh - height / 2`) from this
                  // declared height instead of measuring it.
                  "--c2-rail-h": `${contactRailHeightPx(rail.length)}px`,
                } as CSSProperties
              }
            >
              {rail.map((entry) => {
                const isActive = entry.key === activeRailKey;
                return (
                  <UnstyledButton
                    key={entry.key}
                    type="button"
                    aria-label={`Jump to contacts section ${entry.key}`}
                    aria-current={isActive ? "true" : undefined}
                    title={entry.key}
                    onClick={() => jumpToSection(entry.sectionKey, entry.key)}
                    style={{
                      width: 26,
                      minHeight: CONTACT_RAIL_ENTRY_HEIGHT_PX,
                      // The rail scrolls when it is taller than the window
                      // (`.c2-contact-rail`), so letters must keep their height
                      // instead of flex-shrinking to fit it.
                      flexShrink: 0,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 6,
                      fontSize: "11px",
                      fontWeight: isActive ? 800 : 600,
                      lineHeight: 1,
                      touchAction: "manipulation",
                      color: isActive
                        ? "var(--mantine-color-brand-4)"
                        : "var(--mantine-color-dimmed)",
                      background: isActive
                        ? "var(--mantine-color-brand-light)"
                        : "transparent",
                    }}
                  >
                    {entry.key}
                  </UnstyledButton>
                );
              })}
            </Box>
          )}
        </Box>
      )}

      {/* The floating control pill (below `lg` only): rounded search field +
          sort / filter / download circles, lifted to the measured keyboard top
          while the OS keyboard is up (see the pill const above). */}
      {mobilePill}

      <FilterModal
        opened={filterOpened}
        onClose={closeFilter}
        title="Filter contacts"
        groups={filterGroups}
        values={filterValues}
        onApply={handleApplyFilters}
        originRect={filterOriginRect}
      />

      <ConfirmModal
        opened={confirmOpened}
        onClose={closeConfirm}
        title="Export contacts"
        message={
          <>
            Download {filtered.length} contact{filtered.length === 1 ? "" : "s"} as a .vcf file
            {isNarrowed ? " (current search & filters only)" : ""}?
          </>
        }
        confirmLabel="Download"
        confirmColor="brand"
        confirmIcon={<IconDownload size={16} />}
        loading={downloading}
        onConfirm={downloadVcf}
      />
    </Stack>
  );
}
