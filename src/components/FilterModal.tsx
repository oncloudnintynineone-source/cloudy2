"use client";

import { useState } from "react";
import { Button, Checkbox, Group, Modal, SimpleGrid, Stack, Text } from "@mantine/core";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  label: string;
  options: FilterOption[];
}

interface FilterModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  groups: FilterGroup[];
  values: Record<string, string[]>;
  onApply: (values: Record<string, string[]>) => void;
}

function allOptionValues(group: FilterGroup): string[] {
  return group.options.map((option) => option.value);
}

function isFullySelected(group: FilterGroup, selected: string[]): boolean {
  return selected.length === group.options.length;
}

/**
 * Build the initial draft selection for the dialog: a group with no applied
 * filter shows every option selected ("all selected" = no filter), otherwise it
 * mirrors the applied subset.
 */
function initialDraft(
  groups: FilterGroup[],
  values: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    groups.map((group) => [
      group.label,
      values[group.label]?.length ? values[group.label] : allOptionValues(group),
    ]),
  );
}

/**
 * Reusable filter dialog: opens from a trigger button and presents each filter
 * group as a grid of clickable checkbox cards. Selections are staged in a draft
 * and only applied when "Apply" is pressed. The draft lives in a child that
 * mounts with the modal, so it re-initializes from the current applied values
 * every time the dialog opens. "All selected" means no filter is applied.
 */
export function FilterModal({ opened, onClose, title, groups, values, onApply }: FilterModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered size="sm">
      <FilterModalBody groups={groups} values={values} onApply={onApply} onClose={onClose} />
    </Modal>
  );
}

function FilterModalBody({
  groups,
  values,
  onApply,
  onClose,
}: Pick<FilterModalProps, "groups" | "values" | "onApply" | "onClose">) {
  const [draft, setDraft] = useState<Record<string, string[]>>(() =>
    initialDraft(groups, values),
  );

  function handleGroupChange(key: string, value: string[]) {
    setDraft((prev) => ({ ...prev, [key]: value.length === 0 ? prev[key] : value }));
  }

  function handleApply() {
    const applied = Object.fromEntries(
      groups.map((group) => [
        group.label,
        isFullySelected(group, draft[group.label] ?? []) ? [] : (draft[group.label] ?? []),
      ]),
    );
    onApply(applied);
    onClose();
  }

  function handleClear() {
    setDraft(initialDraft(groups, {}));
  }

  const hasActiveFilter = groups.some(
    (group) => !isFullySelected(group, draft[group.label] ?? []),
  );

  return (
    <Stack>
      {groups.map((group) => (
        <div key={group.label}>
          <Text fw={600} size="sm">
            {group.label}
          </Text>
          <Checkbox.Group
            value={draft[group.label] ?? []}
            onChange={(value) => handleGroupChange(group.label, value)}
          >
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs" mt="xs">
              {group.options.map((option) => (
                <Checkbox.Card
                  key={option.value}
                  value={option.value}
                  withBorder
                  radius="md"
                  style={{ padding: "var(--mantine-spacing-sm)" }}
                >
                  <Group wrap="nowrap" align="center" gap="xs">
                    <Checkbox.Indicator />
                    <Text size="sm">{option.label}</Text>
                  </Group>
                </Checkbox.Card>
              ))}
            </SimpleGrid>
          </Checkbox.Group>
        </div>
      ))}

      <Group justify="space-between" mt="md" wrap="wrap">
        <Button variant="subtle" color="gray" onClick={handleClear} disabled={!hasActiveFilter}>
          Clear
        </Button>
        <Group gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </Group>
      </Group>
    </Stack>
  );
}
