"use client";

import "@mantine/dates/styles.css";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Progress, Stack, Switch, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconAlertTriangle, IconArrowsExchange, IconCircleCheck } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

import { MotionModal } from "@/components/MotionModal";
import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";
import { postJson } from "@/lib/api/client";
import type { EventType } from "@/db/schema";
import {
  defaultMigrationRange,
  validateMigrationRange,
  type MigrationCursor,
} from "@/lib/eventTypes/migration";
import { finalizeEventTypeMigration } from "@/lib/eventTypes/migrationActions";
import type { MigrationChunkResult } from "@/lib/eventTypes/migrationRun";
import { notifyEventsChanged } from "@/lib/ui/eventChanges";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";

const MIGRATE_URL = "/api/settings/event-types/migrate";

export interface EventTypeMigrationPrefill {
  fromName: string;
  toTypeId: string;
  nameChanged: boolean;
  shortnameChanged: boolean;
}

interface EventTypeMigrationModalProps {
  opened: boolean;
  onClose: () => void;
  types: EventType[];
  prefill?: EventTypeMigrationPrefill | null;
  onFinished: () => void;
}

interface Totals {
  scanned: number;
  matched: number;
  updated: number;
  failed: number;
  errors: string[];
}

const EMPTY_TOTALS: Totals = { scanned: 0, matched: 0, updated: 0, failed: 0, errors: [] };

type Phase = "idle" | "running" | "stopping" | "stopped" | "done" | "error";

export function EventTypeMigrationModal({
  opened,
  onClose,
  types,
  prefill,
  onFinished,
}: EventTypeMigrationModalProps) {
  const defaultRange = defaultMigrationRange();
  const [fromName, setFromName] = useState(prefill?.fromName ?? "");
  const [toTypeId, setToTypeId] = useState(prefill?.toTypeId ?? types[0]?.id ?? "");
  const [fromDate, setFromDate] = useState(defaultRange.fromDate);
  const [toDate, setToDate] = useState(defaultRange.toDate);
  const [updateTitles, setUpdateTitles] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [cursor, setCursor] = useState<MigrationCursor | null>(null);
  const [calendarCount, setCalendarCount] = useState(0);
  const [yearCount, setYearCount] = useState(0);
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const runningRef = useRef(false);
  const wasOpenedRef = useRef(false);

  const target = types.find((type) => type.id === toTypeId) ?? null;
  const rangeErrors = validateMigrationRange(fromDate, toDate);
  const rangeValid = Object.keys(rangeErrors).length === 0;
  const running = phase === "running" || phase === "stopping";
  const canStart =
    !running &&
    Boolean(fromName.trim()) &&
    Boolean(target) &&
    rangeValid &&
    (fromName.trim() !== (target?.name ?? "") || updateTitles);

  useEffect(() => {
    if (opened && !wasOpenedRef.current) {
      const range = defaultMigrationRange();
      setFromName(prefill?.fromName ?? "");
      setToTypeId(prefill?.toTypeId ?? types[0]?.id ?? "");
      setFromDate(range.fromDate);
      setToDate(range.toDate);
      setUpdateTitles(true);
      setPhase("idle");
      setTotals(EMPTY_TOTALS);
      setCursor(null);
      setCalendarCount(0);
      setYearCount(0);
      setCurrentYear(null);
      setMessage(null);
    }
    wasOpenedRef.current = opened;
  }, [opened, prefill, types]);

  function resetProgress() {
    if (runningRef.current) {
      return;
    }
    setPhase("idle");
    setTotals(EMPTY_TOTALS);
    setCursor(null);
    setMessage(null);
  }

  function editFromName(value: string) {
    setFromName(value);
    resetProgress();
  }

  function editTarget(value: string) {
    setToTypeId(value);
    resetProgress();
  }

  async function finalize(cancelled: boolean, runTotals: Totals) {
    if (!target) {
      return;
    }
    try {
      const result = await finalizeEventTypeMigration({
        fromName: fromName.trim(),
        toName: target.name,
        toTypeId: target.id,
        fromDate,
        toDate,
        updateTitles,
        eventsScanned: runTotals.scanned,
        eventsUpdated: runTotals.updated,
        failed: runTotals.failed,
        cancelled,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
    } catch {
      notifications.show({
        color: "red",
        message: "Migration finished, but the audit/filter update could not be recorded.",
      });
    }
  }

  async function run(resume: boolean) {
    if (!canStart || !target || runningRef.current) {
      return;
    }
    runningRef.current = true;
    cancelRef.current = false;
    setPhase("running");
    setMessage(null);
    let nextCursor = resume ? cursor : null;
    let runTotals = resume ? totals : EMPTY_TOTALS;
    if (!resume) {
      setTotals(EMPTY_TOTALS);
      setCursor(null);
    }

    try {
      for (;;) {
        const result = await postJson<MigrationChunkResult>(MIGRATE_URL, {
          fromName: fromName.trim(),
          toTypeId: target.id,
          fromDate,
          toDate,
          updateTitles,
          cursor: nextCursor,
        });

        runTotals = {
          scanned: runTotals.scanned + result.scanned,
          matched: runTotals.matched + result.matched,
          updated: runTotals.updated + result.updated,
          failed: runTotals.failed + result.failed,
          errors: [...runTotals.errors, ...result.errors].slice(0, 5),
        };
        setTotals(runTotals);
        setCalendarCount(result.calendarCount);
        setYearCount(result.yearCount);
        nextCursor = result.cursor;
        setCursor(nextCursor);
        setCurrentYear(nextCursor ? Number(fromDate.slice(0, 4)) + nextCursor.yearIndex : null);

        if (cancelRef.current) {
          cancelRef.current = false;
          setPhase("stopped");
          setMessage("Stopped. Events already migrated stay migrated; resume to continue.");
          void finalize(true, runTotals);
          return;
        }
        if (result.done) {
          setPhase("done");
          setMessage(
            runTotals.matched === 0
              ? "No events reference that old type name in the selected range."
              : `Migrated ${runTotals.updated} event${runTotals.updated === 1 ? "" : "s"}.`,
          );
          void finalize(false, runTotals);
          notifyEventsChanged();
          onFinished();
          return;
        }
      }
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Migration failed");
    } finally {
      runningRef.current = false;
    }
  }

  function cancel() {
    if (phase !== "running") {
      return;
    }
    cancelRef.current = true;
    setPhase("stopping");
  }

  const totalSteps = Math.max(1, calendarCount * yearCount);
  const completedSteps =
    cursor === null
      ? phase === "done"
        ? totalSteps
        : 0
      : cursor.yearIndex * calendarCount + cursor.calendarIndex;
  const progress = Math.round((Math.min(completedSteps, totalSteps) / totalSteps) * 100);

  return (
    <MotionModal
      opened={opened}
      onClose={() => {
        if (!running) {
          onClose();
        }
      }}
      title="Migrate event type references"
      centered
      size="lg"
      closeOnClickOutside={!running}
      closeOnEscape={!running}
      withCloseButton={!running}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Existing events store their type by name. Rewrite those references when a type was renamed
          (or refresh their Google titles after a shortname change).
        </Text>

        {message && (
          <Alert
            color={phase === "error" ? "red" : phase === "done" ? "green" : "accent"}
            icon={
              phase === "done" ? <IconCircleCheck size={16} /> : <IconAlertTriangle size={16} />
            }
          >
            {message}
          </Alert>
        )}

        <TextInput
          label="Old type name"
          description="The name currently stored on the old events (the previous type name)."
          placeholder="e.g. Key Appointment Holder Leave"
          value={fromName}
          onChange={(event) => editFromName(event.currentTarget.value)}
          disabled={running}
          required
        />

        <NoKeyboardSelect
          label="Target event type"
          description="Events are re-linked to this type."
          data={types.map((type) => ({ value: type.id, label: type.name }))}
          value={toTypeId}
          onChange={(value) => editTarget(value ?? "")}
          disabled={running}
          required
        />

        <Group grow align="flex-start">
          <DatePickerInput
            label="From"
            description="Defaults to all history."
            value={fromDate || null}
            onChange={(value) => {
              setFromDate(value ?? "");
              resetProgress();
            }}
            minDate={new Date(1970, 0, 1)}
            clearable={false}
            disabled={running}
            error={rangeErrors.fromDate}
            attributes={{ input: { readOnly: true } }}
          />
          <DatePickerInput
            label="To"
            description="Defaults to two years ahead."
            value={toDate || null}
            onChange={(value) => {
              setToDate(value ?? "");
              resetProgress();
            }}
            minDate={fromDate ? new Date(`${fromDate}T00:00:00`) : undefined}
            clearable={false}
            disabled={running}
            error={rangeErrors.toDate}
            attributes={{ input: { readOnly: true } }}
          />
        </Group>

        <Switch
          label="Update Google event titles"
          description="Re-renders each migrated event's summary with the current title template."
          checked={updateTitles}
          onChange={(event) => {
            setUpdateTitles(event.currentTarget.checked);
            resetProgress();
          }}
          disabled={running}
        />

        <Alert color="gray" icon={<IconAlertTriangle size={16} />}>
          Only events in this date range are scanned; anything outside it is left untouched and can
          be migrated later. Shared calendar-view links keep their own copy of the old name.
        </Alert>

        {phase !== "idle" && (
          <Stack gap="xs">
            <Progress
              value={progress}
              animated={running}
              aria-label="Event type migration progress"
            />
            <Text size="sm" c="dimmed">
              {phase === "done"
                ? "Complete."
                : phase === "stopped"
                  ? "Stopped."
                  : calendarCount > 0 && yearCount > 0
                    ? `Scanning ${currentYear ?? "…"} · calendar ${Math.min(
                        (cursor?.calendarIndex ?? 0) + 1,
                        calendarCount,
                      )} of ${calendarCount}`
                    : "Scanning calendars…"}
            </Text>
            <Group gap="lg" wrap="wrap">
              <Text size="sm">Scanned: {totals.scanned}</Text>
              <Text size="sm">Matched: {totals.matched}</Text>
              <Text size="sm">Updated: {totals.updated}</Text>
              {totals.failed > 0 && (
                <Text size="sm" c="red">
                  Failed: {totals.failed}
                </Text>
              )}
            </Group>
            {totals.errors.length > 0 && (
              <Stack gap={2}>
                {totals.errors.map((error) => (
                  <Text key={error} size="xs" c="red">
                    {error}
                  </Text>
                ))}
              </Stack>
            )}
          </Stack>
        )}

        <Group justify="flex-end" gap="sm">
          {running ? (
            <Button variant="default" onClick={cancel} loading={phase === "stopping"}>
              {phase === "stopping" ? "Stopping…" : "Cancel"}
            </Button>
          ) : (
            <>
              <Button variant="default" onClick={onClose}>
                Close
              </Button>
              {(phase === "stopped" || phase === "error") && cursor ? (
                <Button
                  leftSection={<IconArrowsExchange size={16} />}
                  onClick={() => void run(true)}
                  disabled={!canStart}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  leftSection={<IconArrowsExchange size={16} />}
                  onClick={() => void run(false)}
                  disabled={!canStart}
                  loaderProps={BUTTON_LOADER_PROPS}
                >
                  {phase === "done" ? "Migrate another range" : "Start migration"}
                </Button>
              )}
            </>
          )}
        </Group>
      </Stack>
    </MotionModal>
  );
}
