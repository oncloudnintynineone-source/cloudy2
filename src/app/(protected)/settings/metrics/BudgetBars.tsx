"use client";

import { Badge, Card, Group, Progress, Stack, Text, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

import { formatBytes } from "@/lib/metrics/format";
import type { BudgetBar } from "@/lib/metrics/queries";
import type { ThresholdStatus } from "@/lib/metrics/thresholds";

/**
 * The three budget bars — the first thing on the page, because they answer the
 * one question it exists for: *will we still fit by the end of the month?*
 *
 * Two things are deliberately explicit rather than decorative. An estimated
 * figure says so (Neon's own usage API is paid-plan only, so compute and egress
 * are derived), and a projection is shown as a date with days remaining — a
 * percentage tells you nothing you can act on, "the cap lands on 27 Nov, 5 days
 * from now" tells you to ship the egress fix this week.
 */

export const STATUS_COLOR: Record<ThresholdStatus, string> = {
  ok: "blue",
  watch: "yellow",
  critical: "red",
  unknown: "gray",
};

export const STATUS_LABEL: Record<ThresholdStatus, string> = {
  ok: "OK",
  watch: "Watch",
  critical: "Critical",
  unknown: "No data",
};

function formatValue(budget: BudgetBar): string {
  return budget.unit === "bytes" ? formatBytes(budget.used) : `${budget.used.toFixed(1)} h`;
}

function formatCap(budget: BudgetBar): string {
  return budget.unit === "bytes" ? formatBytes(budget.cap) : `${budget.cap.toFixed(0)} h`;
}

/** The sentence under a bar. Written as prose because it is read, not scanned. */
function projectionSentence(budget: BudgetBar): string | null {
  const projection = budget.projection;
  if (!projection) {
    return null;
  }
  if (projection.insufficientData) {
    return "Too few closed days to project a month-end yet.";
  }
  if (projection.daysToCap === 0) {
    return "Already past the cap — this month has used more than the allowance allows.";
  }
  if (projection.daysToCap !== null) {
    return `At this rate the cap is reached in ${projection.daysToCap} ${
      projection.daysToCap === 1 ? "day" : "days"
    }.`;
  }
  return `At this rate the month ends at ${Math.round(
    (projection.projectedFraction ?? 0) * 100,
  )}% of the cap.`;
}

export function BudgetBars({ budgets }: { budgets: BudgetBar[] }) {
  return (
    <Stack gap="sm">
      {budgets.map((budget) => {
        const fraction = budget.cap > 0 ? Math.min(1.5, budget.used / budget.cap) : 0;
        const sentence = projectionSentence(budget);
        return (
          <Card key={budget.key} withBorder padding="sm" radius="sm">
            <Group justify="space-between" wrap="nowrap" mb={6}>
              <Group gap={6} wrap="nowrap">
                <Text fw={600} size="sm">
                  {budget.label}
                </Text>
                <Tooltip label={budget.note ?? budget.basis} multiline w={280}>
                  <IconInfoCircle size={14} style={{ opacity: 0.6 }} aria-hidden />
                </Tooltip>
                {budget.estimated && (
                  <Badge size="xs" variant="light" color="gray">
                    estimated
                  </Badge>
                )}
              </Group>
              <Badge size="xs" variant="light" color={STATUS_COLOR[budget.status]}>
                {STATUS_LABEL[budget.status]}
              </Badge>
            </Group>

            <Group justify="space-between" wrap="nowrap" mb={4}>
              <Text size="lg" fw={700} lh={1.1}>
                {formatValue(budget)}
                <Text component="span" size="xs" c="dimmed" fw={400}>
                  {"  /  "}
                  {formatCap(budget)}
                </Text>
              </Text>
              {budget.projection?.usedFraction != null && (
                <Text size="xs" c="dimmed">
                  {Math.round(budget.projection.usedFraction * 100)}% used
                </Text>
              )}
            </Group>

            <Progress
              value={Math.min(100, fraction * 100)}
              color={STATUS_COLOR[budget.status]}
              size="sm"
              radius="sm"
              aria-label={`${budget.label}: ${formatValue(budget)} of ${formatCap(budget)}`}
            />

            <Text size="xs" c="dimmed" mt={6}>
              {sentence ?? budget.basis}
            </Text>
          </Card>
        );
      })}
      <Text size="xs" c="dimmed">
        Storage is measured exactly with <code>pg_database_size</code>. Compute and egress are
        derived from the app&apos;s own traffic — Neon&apos;s usage API is paid-plan only — so read
        them as a trend you can calibrate, not as an invoice. The authoritative figures live in
        Neon Console → Billing → Usage.
      </Text>
    </Stack>
  );
}
