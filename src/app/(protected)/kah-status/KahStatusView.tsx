"use client";

import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { ActionIcon, Badge, Group, Paper, Stack, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import { DateSelectorModal } from "@/components/DateSelectorModal";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";

/** One group's live KAH status for the shown day (names pre-resolved). */
export interface KahStatusRow {
  groupId: string;
  name: string;
  requiredPct: number;
  actualPct: number;
  totalMembers: number;
  awayNames: string[];
  breached: boolean;
}

interface KahStatusViewProps {
  date: string;
  rows: KahStatusRow[];
  /** Admin view: shows every KAH group (not just the viewer's memberships). */
  allGroups?: boolean;
}

/** How many points below the requirement an amber (caution) group may be. */
const AMBER_TOLERANCE = 10;

type StatusTone = "green" | "amber" | "red";

function statusTone(row: KahStatusRow): StatusTone {
  const gap = row.requiredPct - row.actualPct;
  if (gap > 0) {
    // Below the requirement: amber within the tolerance, red beyond it.
    return gap <= AMBER_TOLERANCE ? "amber" : "red";
  }
  return "green";
}

function statusBadge(row: KahStatusRow) {
  const tone = statusTone(row);
  if (tone === "green") {
    return (
      <Badge size="sm" variant="light" color="green">
        OK
      </Badge>
    );
  }
  if (tone === "amber") {
    return (
      <Badge size="sm" variant="light" color="yellow">
        Caution
      </Badge>
    );
  }
  return (
    <Badge size="sm" variant="light" color="red">
      Breach
    </Badge>
  );
}

export function KahStatusView({ date, rows, allGroups = false }: KahStatusViewProps) {
  const router = useRouter();
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);

  const dayLabel = dayjs(date).format("ddd, MMM D, YYYY");

  const shiftDay = (delta: number) => {
    const next = dayjs(date).add(delta, "day").format("YYYY-MM-DD");
    router.push(`/kah-status?date=${next}`);
  };

  const pickDate = (picked: string) => {
    if (picked !== date) {
      router.push(`/kah-status?date=${picked}`);
    }
  };

  return (
    <Stack gap="md" pb="xl" className={CONTENT_ENTER_CLASS}>
      {/* Day navigation, same shape as the parade-state header. Tapping the
          centered label opens the no-keyboard date picker. */}
      <Group align="center" gap="xs" wrap="nowrap">
        <ActionIcon size={43} variant="default" aria-label="Previous day" onClick={() => shiftDay(-1)}>
          <IconChevronLeft size={18} />
        </ActionIcon>
        <Text
          fw={600}
          size="lg"
          lineClamp={1}
          style={{ flex: 1, minWidth: 0, textAlign: "center", cursor: "pointer" }}
          onClick={openPicker}
        >
          {dayLabel}
        </Text>
        <ActionIcon size={43} variant="default" aria-label="Next day" onClick={() => shiftDay(1)}>
          <IconChevronRight size={18} />
        </ActionIcon>
      </Group>

      {allGroups ? (
        <Text fz="sm" c="dimmed">
          Admin view — showing all KAH groups
        </Text>
      ) : null}

      {rows.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          {allGroups ? "No KAH groups exist yet." : "You are not part of any KAH group."}
        </Text>
      ) : (
        <>
          {/* Mobile: card list */}
          <Stack gap="sm" hiddenFrom="lg">
            {rows.map((row) => {
              const tone = statusTone(row);
              const label = statusBadge(row);
              return (
                <Paper key={row.groupId} withBorder p="sm">
                  <Stack gap={6}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={600} lineClamp={1}>
                        {row.name}
                      </Text>
                      {label}
                    </Group>
                    <Text fz="sm" c="dimmed">
                      {row.actualPct}% / {row.requiredPct}% in country ({row.totalMembers} member
                      {row.totalMembers === 1 ? "" : "s"})
                    </Text>
                    <AwayLine row={row} tone={tone} />
                  </Stack>
                </Paper>
              );
            })}
          </Stack>

          {/* Desktop: data table */}
          <Paper withBorder visibleFrom="lg">
            <Table withRowBorders={false} highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Group</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>In country</Table.Th>
                  <Table.Th>Away</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => {
                  const tone = statusTone(row);
                  return (
                    <Table.Tr key={row.groupId}>
                      <Table.Td>
                        <Text fw={600}>{row.name}</Text>
                      </Table.Td>
                      <Table.Td>{statusBadge(row)}</Table.Td>
                      <Table.Td>
                        <Text fz="sm">
                          {row.actualPct}% of {row.requiredPct}% ({row.totalMembers} member
                          {row.totalMembers === 1 ? "" : "s"})
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <AwayLine row={row} tone={tone} />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Paper>
        </>
      )}

      <DateSelectorModal opened={pickerOpened} date={date} onPick={pickDate} onClose={closePicker} />
    </Stack>
  );
}

function AwayLine({ row, tone }: { row: KahStatusRow; tone: StatusTone }) {
  if (row.awayNames.length === 0) {
    return (
      <Text fz="sm" c="dimmed">
        No one away
      </Text>
    );
  }
  return (
    <Text fz="sm" c={tone === "red" ? "red" : undefined} lineClamp={2}>
      {row.awayNames.join(", ")}
    </Text>
  );
}
