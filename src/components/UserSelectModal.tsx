"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconSearch, IconX } from "@tabler/icons-react";

import {
  filterPickerGroups,
  selectionByGroup,
  sortOptionsInGroups,
  type PickerGroup,
} from "@/lib/users/userSelect";

interface UserSelectModalProps {
  opened: boolean;
  onClose: () => void;
  /** Sections rendered top-to-bottom in array order. */
  groups: PickerGroup[];
  /** Currently selected option ids per section label; seeds the draft on open. */
  values: Record<string, string[]>;
  onConfirm: (values: Record<string, string[]>) => void;
  title?: string;
  confirmLabel?: string;
  /** z-index for stacking above the parent modal that opens this dialog. */
  zIndex?: number;
}

/**
 * Generic badge picker: sections of toggleable badges with an instant search
 * box on top. Typing removes non-matching options immediately (sections
 * persist, emptied ones disappear). The dialog has a fixed height — search
 * pinned top, footer pinned bottom, only the badge sections scroll — so
 * narrowing the list never resizes it or pushes the search box out of view.
 * The selection is staged in a draft and
 * only committed when the confirm button is pressed. The draft lives in a
 * child that mounts with the modal, so it re-initializes from values every
 * time the dialog opens (the FilterModalBody pattern).
 */
export function UserSelectModal({
  opened,
  onClose,
  groups,
  values,
  onConfirm,
  title = "Select",
  confirmLabel = "Select",
  zIndex,
}: UserSelectModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size={isDesktop ? "md" : "sm"}
      zIndex={zIndex}
      // Fixed height so filtering never resizes the dialog: the search box
      // stays pinned at the top and the footer at the bottom while only the
      // badge sections scroll. An auto-sized modal would shrink and re-center
      // on every keystroke (behind the mobile keyboard once it filters down).
      styles={{
        content: {
          height: "min(560px, calc(100dvh - 96px))",
          display: "flex",
          flexDirection: "column",
        },
        body: { flex: 1, minHeight: 0, overflow: "hidden" },
      }}
    >
      <UserSelectModalBody
        groups={groups}
        values={values}
        onConfirm={onConfirm}
        onClose={onClose}
        confirmLabel={confirmLabel}
      />
    </Modal>
  );
}

function UserSelectModalBody({
  groups,
  values,
  onConfirm,
  onClose,
  confirmLabel,
}: Pick<UserSelectModalProps, "groups" | "values" | "onConfirm" | "onClose" | "confirmLabel">) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Record<string, string[]>>(() =>
    selectionByGroup(groups, Object.values(values).flat()),
  );
  const sorted = useMemo(() => sortOptionsInGroups(groups), [groups]);
  const visible = useMemo(() => filterPickerGroups(sorted, query), [sorted, query]);
  const selectedCount = Object.values(draft).reduce((sum, ids) => sum + ids.length, 0);

  function toggle(section: PickerGroup, optionId: string) {
    setDraft((prev) => {
      const current = prev[section.label] ?? [];
      return {
        ...prev,
        [section.label]: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      };
    });
  }

  function handleClear() {
    setDraft(selectionByGroup(groups, []));
  }

  function handleConfirm() {
    onConfirm(draft);
    onClose();
  }

  return (
    <Stack h="100%" style={{ overflow: "hidden" }}>
      <TextInput
        aria-label="Search"
        placeholder="Search"
        leftSection={<IconSearch size={14} style={{ color: "var(--mantine-color-dimmed)" }} />}
        rightSection={
          query ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <IconX size={14} />
            </ActionIcon>
          ) : null
        }
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      <Stack flex={1} gap="md" style={{ overflowY: "auto", minHeight: 0 }}>
        {visible.length === 0 ? (
          <Text size="sm" c="dimmed">
            No matches for &ldquo;{query.trim()}&rdquo;
          </Text>
        ) : (
          visible.map((section) => (
            <div key={section.label}>
              <Text fw={600} size="sm" mb={6}>
                {section.label}
              </Text>
              <Group gap={6} wrap="wrap">
                {section.options.map((option) => {
                  const selected = (draft[section.label] ?? []).includes(option.id);
                  return (
                    // A real button (not an onClick Badge): keyboard-operable and
                    // announces its pressed state. The Badge keeps the visual.
                    <UnstyledButton
                      key={option.id}
                      aria-pressed={selected}
                      aria-label={`${option.label}${selected ? ", selected" : ""}`}
                      onClick={() => toggle(section, option.id)}
                      style={{ cursor: "pointer", borderRadius: "var(--mantine-radius-md)" }}
                    >
                      <Badge
                        variant={selected ? "filled" : "light"}
                        size="lg"
                        style={{ height: "calc(var(--badge-height-lg) * 1.5)" }}
                      >
                        {option.label}
                      </Badge>
                    </UnstyledButton>
                  );
                })}
              </Group>
            </div>
          ))
        )}
      </Stack>

      <Group justify="space-between" wrap="wrap">
        <Button variant="subtle" color="gray" onClick={handleClear} disabled={selectedCount === 0}>
          Clear
        </Button>
        <Group gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
