"use client";

import { useMemo, useRef, useState } from "react";
import { Badge, Box, Group, Paper, Stack, Text } from "@mantine/core";
import { LazyModal } from "@/components/LazyModal";

import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconArrowsExchange,
  IconCalendarEvent,
  IconCategory2,
  IconFolder,
  IconPlus,
  IconSearchOff,
} from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { SettingsListChrome } from "@/components/SettingsListChrome";
import type { EventType } from "@/db/schema";
import { formatColorLabel } from "@/lib/events/eventColors";
import { ColorDot } from "@/components/ColorSwatchPicker";
import { LOCATION_CATEGORY_LABELS, normalizeAllowedLocations } from "@/lib/events/locationPolicy";
import {
  TIME_OPTION_LABELS,
  normalizeTimeOptions,
  resolveTimeOptions,
} from "@/lib/events/timeOptions";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { fuzzyFilter } from "@/lib/search/fuzzy";
import { DESKTOP_MEDIA_QUERY } from "@/lib/theme";
import { activatable } from "@/lib/ui/activatable";
import { useEntityEditor } from "@/lib/ui/useEntityEditor";
import dynamic from "next/dynamic";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { useChunkReady } from "@/lib/loading/chunkReady";
import { EventTypeGroupsModal } from "./EventTypeGroupsModal";
import { useActivityRefresh } from "@/components/ActivityBar";
import type { EventTypeRenameMigrationHint } from "@/lib/eventTypes/actions";
import { EventTypeMigrationModal, type EventTypeMigrationPrefill } from "./EventTypeMigrationModal";
import type { ReorderDrag } from "@/lib/settings/featureFlags";

// The add/edit event-type form is only mounted on tap; split it out of the
// event-types route's initial chunk. The chunk reveal dissolves through
// `CrossfadeSwap` instead of `dynamic`'s hard-cut fallback.
const loadEventTypeForm = () => import("./EventTypeForm").then((mod) => mod.EventTypeForm);
const EventTypeForm = dynamic(loadEventTypeForm, { ssr: false, loading: () => null });

interface EventTypeTableProps {
  types: EventType[];
  groups: { id: string; name: string; sortOrder: number; collapsible: boolean }[];
  reorderDrag: ReorderDrag;
}

export function EventTypeTable({ types, groups, reorderDrag }: EventTypeTableProps) {
  const refreshAfterSave = useActivityRefresh("event-types:save");
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const paneRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const editor = useEntityEditor<EventType>();
  const [groupsOpened, { open: openGroups, close: closeGroups }] = useDisclosure(false);
  const [migrationOpened, { open: openMigration, close: closeMigration }] = useDisclosure(false);
  const [migrationPrefill, setMigrationPrefill] = useState<EventTypeMigrationPrefill | null>(null);
  const eventTypeFormReady = useChunkReady(loadEventTypeForm, editor.opened);

  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const eventType of types) {
      if (eventType.groupId) {
        counts.set(eventType.groupId, (counts.get(eventType.groupId) ?? 0) + 1);
      }
    }
    return counts;
  }, [types]);

  const filteredTypes = useMemo(
    () =>
      fuzzyFilter(types, search, (eventType) => [
        eventType.name,
        eventType.shortname,
        groupById.get(eventType.groupId ?? "")?.name ?? "",
      ]),
    [types, search, groupById],
  );

  function openCreate() {
    editor.openCreate();
  }

  function openEdit(eventType: EventType) {
    editor.openEdit(eventType);
  }

  function openMigrationTool() {
    setMigrationPrefill(null);
    openMigration();
  }

  function handleFormDone(migration?: EventTypeRenameMigrationHint) {
    editor.closeEditor();
    refreshAfterSave();
    if (migration) {
      setMigrationPrefill(migration);
      openMigration();
    }
  }

  return (
    <Stack ref={paneRef} gap="md" className={`${CONTENT_ENTER_CLASS} settings-pill-page-pad`}>
      <SettingsListChrome
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, shortname, or group"
        searchAriaLabel="Search event types by name, shortname, or group"
        actions={[
          {
            label: "Manage groups",
            icon: <IconCategory2 size={18} />,
            onClick: openGroups,
          },
          {
            label: "Migrate events",
            icon: <IconArrowsExchange size={18} />,
            onClick: openMigrationTool,
          },
          {
            label: "Add event type",
            icon: <IconPlus size={18} />,
            onClick: openCreate,
            primary: true,
          },
        ]}
        paneRef={paneRef}
      />

      {types.length === 0 ? (
        <EmptyState
          icon={<IconCalendarEvent size={18} />}
          description="No event types yet. Create one to define its shortname, time options, allowed locations and visibility."
          actionLabel="Add event type"
          onAction={openCreate}
        />
      ) : filteredTypes.length === 0 ? (
        <EmptyState
          icon={<IconSearchOff size={18} />}
          description="No event types match your search."
          actionLabel="Clear search"
          onAction={() => setSearch("")}
        />
      ) : (
        <Box component="div" className="card-grid">
          {filteredTypes.map((eventType) => (
            <Paper
              key={eventType.id}
              withBorder
              p="sm"
              className="c2-defer-render"
              onClick={() => openEdit(eventType)}
              {...activatable(() => openEdit(eventType))}
              style={{ cursor: "pointer" }}
            >
              <Stack gap={0}>
                <Group wrap="nowrap" align="center" gap={6}>
                  <ColorDot color={eventType.color} />
                  <Text fw={600}>{eventType.name}</Text>
                </Group>
                <Group gap="xs" wrap="wrap">
                  {eventType.groupId && groupById.has(eventType.groupId) ? (
                    <Badge
                      size="sm"
                      variant="light"
                      color="blue"
                      leftSection={
                        groupById.get(eventType.groupId)?.collapsible ? (
                          <IconFolder size={12} />
                        ) : undefined
                      }
                    >
                      {groupById.get(eventType.groupId)?.name}
                    </Badge>
                  ) : null}
                  {eventType.shortname ? (
                    <Badge size="sm" variant="light" color="accent">
                      {eventType.shortname}
                    </Badge>
                  ) : null}
                  {resolveTimeOptions(normalizeTimeOptions(eventType.timeOptions)).map((option) => (
                    <Badge key={option} size="sm" variant="light" color="gray">
                      {TIME_OPTION_LABELS[option]}
                    </Badge>
                  ))}
                  {normalizeAllowedLocations(eventType.allowedLocations).map((category) => (
                    <Badge key={category} size="sm" variant="light" color="accent">
                      {LOCATION_CATEGORY_LABELS[category]}
                    </Badge>
                  ))}
                  {eventType.showRemarks === false && (
                    <Badge size="sm" variant="light" color="gray">
                      No remarks
                    </Badge>
                  )}
                  {eventType.showInvitees === false && (
                    <Badge size="sm" variant="light" color="gray">
                      No participants
                    </Badge>
                  )}
                  {eventType.showLocation === false && (
                    <Badge size="sm" variant="light" color="gray">
                      No location
                    </Badge>
                  )}
                  {eventType.excludeFromClash === true && (
                    <Badge size="sm" variant="light" color="red">
                      Info only
                    </Badge>
                  )}
                  <Badge size="sm" variant="light" color="gray">
                    {formatColorLabel(eventType.color, eventType.name)}
                  </Badge>
                </Group>
              </Stack>
            </Paper>
          ))}
        </Box>
      )}

      <LazyModal
        opened={editor.opened}
        onClose={editor.closeEditor}
        title={editor.editing ? "Edit event type" : "Add event type"}
        size={isDesktop ? "lg" : "sm"}
        ready={eventTypeFormReady}
        skeleton={<FormModalSkeleton rows={5} />}
      >
        <EventTypeForm
          key={editor.editing?.id ?? "new"}
          eventType={editor.editing}
          groups={groups}
          onDone={handleFormDone}
        />
      </LazyModal>

      <EventTypeGroupsModal
        opened={groupsOpened}
        onClose={closeGroups}
        groups={groups}
        typeCounts={typeCounts}
        reorderDrag={reorderDrag}
        onMutated={() => {
          refreshAfterSave();
        }}
      />

      <EventTypeMigrationModal
        opened={migrationOpened}
        onClose={() => {
          closeMigration();
          setMigrationPrefill(null);
        }}
        types={types}
        prefill={migrationPrefill}
        onFinished={refreshAfterSave}
      />
    </Stack>
  );
}
