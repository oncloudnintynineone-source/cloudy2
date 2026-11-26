"use client";

import { useState } from "react";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconPower, IconRefresh } from "@tabler/icons-react";

import { useMotion } from "@/components/MotionProvider";
import type { LedgerSummary } from "@/lib/metrics/queries";
import type { MetricsFormValues } from "@/lib/metrics/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { ConfigForm } from "./ConfigForm";
import { BudgetBars, STATUS_COLOR, STATUS_LABEL } from "./BudgetBars";
import { LedgerTable } from "./LedgerTable";
import { SourcesPanel } from "./SourcesPanel";
import { runSnapshotNowAction } from "./actions";

/**
 * Settings → Resource Usage.
 *
 * Ordered by what the admin can act on: the three budget bars first (will we
 * still fit this month), then the day-by-day ledger and its "what drove it"
 * drill-down, then the sources that explain any number they cannot explain,
 * and only then the configuration.
 *
 * The page reads a daily ledger, so it refreshes on entry and on demand rather
 * than polling — a 30-second poll of a once-a-day number is load for its own
 * sake, and this deployment pays for load in the currency the page reports on.
 */
export function MetricsView({
  summary,
  initialConfig,
}: {
  summary: LedgerSummary;
  initialConfig: MetricsFormValues;
}) {
  const motion = useMotion();
  const [snapshotting, setSnapshotting] = useState(false);

  const statementsInstalled = summary.sources.some(
    (source) => source.key === "statements" && source.state === "ok",
  );

  async function snapshotNow() {
    if (snapshotting) {
      return;
    }
    setSnapshotting(true);
    try {
      const result = await runSnapshotNowAction();
      if (!result.ok) {
        notifications.show({ color: "red", message: result.error ?? "Snapshot failed" });
        return;
      }
      notifications.show({
        color: "green",
        message:
          result.days && result.days.length > 0
            ? `Closed ${result.days.join(", ")}`
            : "Today is already closed — the ledger runs once a day",
      });
    } finally {
      setSnapshotting(false);
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Group gap="xs" align="center" wrap="nowrap">
            <Title order={3} size="h3">
              Resource usage
            </Title>
            <Badge size="sm" variant="light" color={STATUS_COLOR[summary.status]}>
              {STATUS_LABEL[summary.status]}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Production&apos;s consumption of the Neon allowances, one row per day. Storage is
            measured; compute and egress are estimated from the app&apos;s own traffic, because
            Neon&apos;s usage API is a paid-plan feature.
          </Text>
        </div>
        <Button
          leftSection={<IconRefresh size={16} />}
          loaderProps={BUTTON_LOADER_PROPS}
          loading={snapshotting}
          onClick={snapshotNow}
        >
          Snapshot now
        </Button>
      </Group>

      {!summary.enabled && (
        <Alert
          color="yellow"
          icon={<IconAlertTriangle size={18} />}
          title="Collection is switched off"
        >
          The ledger keeps the history it has but records nothing new. Turn it back on in
          Configuration below.
        </Alert>
      )}

      <BudgetBars budgets={summary.budgets} />

      <Card withBorder padding="sm" radius="sm">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={600} size="sm">
              Daily ledger
            </Text>
            <Text size="xs" c="dimmed">
              {summary.latestDay
                ? `Last closed ${summary.latestDay} · snapshot runs daily at ${summary.snapshotTime}`
                : `Nothing closed yet — the first snapshot runs at ${summary.snapshotTime}`}
            </Text>
          </Group>
          {summary.days.length === 0 ? (
            <Text size="sm" c="dimmed">
              No closed days yet. The first snapshot runs on the first app activity at or after{" "}
              {summary.snapshotTime} today.
            </Text>
          ) : (
            <LedgerTable
              days={summary.days}
              details={summary.details}
              statementsInstalled={statementsInstalled}
            />
          )}
        </Stack>
      </Card>

      <SourcesPanel sources={summary.sources} />

      <Accordion
        chevronPosition="left"
        variant="contained"
        transitionDuration={motion.duration.popover}
      >
        <Accordion.Item value="configuration">
          <Accordion.Control>
            <Group gap="xs">
              <IconPower size={16} />
              <Text fw={600} size="sm">
                Configuration
              </Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <ConfigForm initial={initialConfig} />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
