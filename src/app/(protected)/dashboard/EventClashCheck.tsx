"use client";

import { useEffect, useState } from "react";
import { Box, Button, Group, Loader, Paper, Skeleton, Stack, Text } from "@mantine/core";
import { IconCircleCheck, IconRefresh } from "@tabler/icons-react";

import { LoadingStatus } from "@/components/LoadingStatus";
import { ClashAffectedChips, clashTitlesPreview } from "@/components/clashUi";
import { ClashCard, ClashEventRow } from "@/components/clashCards";
import {
  checkEventClashes,
  type EventClashCheckRequest,
  type EventClashCheckResult,
} from "@/lib/events/clashActions";

type ClashCheckOk = Extract<EventClashCheckResult, { ok: true }>;

/** The panel's current view, derived from `request` + the latest outcome. */
type View = { kind: "checking" } | { kind: "error" } | { kind: "done"; result: ClashCheckOk };

/**
 * Pre-submit clash advisory for the event wizard's review step. Runs the
 * server check whenever `request` changes (a new stable request object is
 * produced by the parent each time the candidate time/people actually change)
 * and on an explicit Retry. Purely advisory — it never blocks the save.
 */
export function EventClashCheck({ request }: { request: EventClashCheckRequest | null }) {
  // `attempt` lets Retry re-run the same request without touching request's
  // identity. State is only ever set from the async action callbacks — the
  // "checking" view is derived from the request/outcome pair, never set
  // synchronously in the effect.
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{
    request: EventClashCheckRequest;
    attempt: number;
    ok: boolean;
    result: ClashCheckOk | null;
  } | null>(null);

  useEffect(() => {
    if (!request) {
      return;
    }
    // Server actions are not cancellable; ignore the result of a superseded
    // request (unmount or a newer request/attempt) via the cleanup flag.
    let cancelled = false;
    checkEventClashes(request)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setOutcome(
          result.ok
            ? { request, attempt, ok: true, result }
            : { request, attempt, ok: false, result: null },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setOutcome({ request, attempt, ok: false, result: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [request, attempt]);

  if (!request) {
    return null;
  }

  let view: View;
  if (outcome && outcome.request === request && outcome.attempt === attempt) {
    view =
      outcome.ok && outcome.result ? { kind: "done", result: outcome.result } : { kind: "error" };
  } else {
    view = { kind: "checking" };
  }

  if (view.kind === "checking") {
    return (
      <Paper withBorder p="sm">
        <LoadingStatus label="Checking for clashes" />
        <Stack gap={6}>
          <Group gap={6} c="dimmed">
            <Loader size="xs" />
            <Text size="xs">Checking for clashes…</Text>
          </Group>
          <Skeleton height={10} radius="sm" />
          <Skeleton height={10} radius="sm" width="80%" />
        </Stack>
      </Paper>
    );
  }

  if (view.kind === "error") {
    return (
      <Paper withBorder p="sm">
        <Group justify="space-between" align="center" gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed">
            Could not check for clashes.
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<IconRefresh size={12} />}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </Button>
        </Group>
      </Paper>
    );
  }

  const { result } = view;
  if (result.clashes.length > 0) {
    const affectedCount = new Set(
      result.clashes.flatMap((clash) => clash.affected.map((person) => person.userId)),
    ).size;
    return (
      <ClashCard
        heading={`Double booking: ${affectedCount} ${
          affectedCount === 1 ? "person" : "people"
        } · ${clashTitlesPreview(result.clashes)}`}
      >
        {result.clashes.map((entry) => (
          <ClashEventRow
            key={`${entry.calendarName}:${entry.startNaive}:${entry.title}`}
            entry={entry}
            chips={
              <ClashAffectedChips
                affected={entry.affected}
                currentUserId={result.currentUserId}
              />
            }
          />
        ))}
        <Text size="xs" c="dimmed">
          You can still save this event — these are warnings only.
        </Text>
      </ClashCard>
    );
  }

  return (
    <Paper withBorder p="sm" role="status" aria-live="polite">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <IconCircleCheck
          size={18}
          style={{ flexShrink: 0, marginTop: 2 }}
          color="var(--mantine-color-green-6)"
          aria-hidden
        />
        <Box>
          <Text size="sm">
            No clashes detected across {result.checkedPeople}{" "}
            {result.checkedPeople === 1 ? "person" : "people"} for this time.
          </Text>
        </Box>
      </Group>
    </Paper>
  );
}
