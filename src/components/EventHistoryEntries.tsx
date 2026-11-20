"use client";

import { useId, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Collapse,
  Text,
  UnstyledButton,
  type MantineColor,
} from "@mantine/core";
import { IconChevronDown, IconInfoCircle } from "@tabler/icons-react";

import { FormattedAuditDetails } from "@/components/AuditDetails";
import { useMotion } from "@/components/MotionProvider";
import {
  EVENT_HISTORY_OMIT_KEYS,
  formatAuditDetails,
  hasAuditDetails,
  type AuditDetailOptions,
  type AuditDisplayDetails,
} from "@/lib/audit/format";
import type { ChangeTrailKind, HistoryEntryItem } from "@/lib/events/changeTrail";

/**
 * The read-only life story of one logical event, as a vertical rail: the create
 * row, every subsequent edit, and the delete row when it exists — newest first,
 * already collapsed by `buildHistoryEntries` (per-copy same-minute fan-out
 * merged, participant-notify rows dropped, matching the inline My Events trail).
 *
 * The rail is the redesign: what happened, when, and who made the change are
 * facts the reader scans top to bottom, so they are always on the surface —
 * never behind a tap that has to be opened to learn it was the wrong entry.
 * Only the before→after diff folds away, and only where there is a diff worth
 * reading (an edit whose only change was a derived value the reader cannot set
 * gets no disclosure control at all).
 *
 * Items whose `details` are still null are the page-load preview: identical
 * headers, not yet expandable until the freshly fetched rows swap in.
 */

/** The curated view of an audit row for the person who made the change. */
const DETAIL_OPTIONS: AuditDetailOptions = {
  omitKeys: EVENT_HISTORY_OMIT_KEYS,
  dropEmpty: true,
  // The resulting-state dump repeats every field the entry did not touch; the
  // change lines already say what happened.
  includeAfter: false,
};

const KIND_COLOR: Record<ChangeTrailKind, MantineColor> = {
  create: "brand",
  update: "accent",
  delete: "red",
};

export function EventHistoryEntries({
  items,
  coverageNote,
}: {
  items: HistoryEntryItem[];
  /** Why the trail may not reach the event's creation (see `historyCoverageNote`). */
  coverageNote?: string | null;
}) {
  const entries = useMemo(
    () =>
      items.map((item, index) => ({
        item,
        key: `${item.kind}-${item.absolute}-${index}`,
        details: item.details === null ? null : formatAuditDetails(item.details, DETAIL_OPTIONS),
      })),
    [items],
  );
  const expandableKeys = entries
    .filter((entry) => entry.details !== null && hasAuditDetails(entry.details))
    .map((entry) => entry.key);

  // Open state lives here rather than per entry so one control can open the
  // whole trail; keyed by the entry, so a preview swapping for freshly fetched
  // rows keeps whatever the reader had opened.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const allOpen = expandableKeys.length > 0 && expandableKeys.every((key) => openMap[key]);

  return (
    <>
      {expandableKeys.length > 1 ? (
        <Box mb="xs">
          <Button
            variant="subtle"
            size="xs"
            m={0}
            p={0}
            w="fit-content"
            onClick={() =>
              setOpenMap(
                allOpen ? {} : Object.fromEntries(expandableKeys.map((key) => [key, true])),
              )
            }
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </Button>
        </Box>
      ) : null}
      <ol className="c2-hist">
        {entries.map(({ item, key, details }) => (
          <HistoryEntry
            key={key}
            item={item}
            details={details}
            open={openMap[key] === true}
            onToggle={() => setOpenMap((map) => ({ ...map, [key]: !map[key] }))}
          />
        ))}
      </ol>
      {coverageNote ? (
        <Text
          size="xs"
          c="dimmed"
          mt="sm"
          style={{ display: "flex", gap: 6, alignItems: "flex-start" }}
        >
          <IconInfoCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
          <span>{coverageNote}</span>
        </Text>
      ) : null}
    </>
  );
}

/**
 * One entry on the rail: a bullet, then the always-visible facts (action, how
 * long ago, who, the exact stamp, and which fields moved), then the diff behind
 * a disclosure that only exists when there is a diff to read.
 */
function HistoryEntry({
  item,
  details,
  open,
  onToggle,
}: {
  item: HistoryEntryItem;
  details: AuditDisplayDetails | null;
  open: boolean;
  onToggle: () => void;
}) {
  const motion = useMotion();
  const regionId = useId();
  const expandable = details !== null && hasAuditDetails(details);
  // The field chips come from the collapsed summary, which both the page-load
  // preview and the fetched rows build the same way — so the swap reflows nothing.
  const fields = item.summary ? item.summary.split(", ") : [];

  const content = (
    <>
      <span className="c2-hist-line">
        <Badge component="span" size="xs" variant="light" color={KIND_COLOR[item.kind]}>
          {item.label}
        </Badge>
        <Text component="span" size="xs" c="dimmed">
          {item.relative}
        </Text>
      </span>
      <Text component="span" size="xs" c="dimmed" className="c2-hist-meta">
        {item.actor} · {item.absolute}
      </Text>
      {fields.length > 0 ? (
        <span className="c2-hist-chips">
          {fields.map((field) => (
            <Badge key={field} component="span" size="xs" variant="light" color="gray" radius="sm">
              {field}
            </Badge>
          ))}
        </span>
      ) : null}
    </>
  );

  return (
    <li className="c2-hist-item" data-kind={item.kind}>
      <span className="c2-hist-bullet" aria-hidden />
      <div className="c2-hist-body">
        {expandable ? (
          <UnstyledButton
            type="button"
            className="c2-hist-head"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={regionId}
          >
            <span className="c2-hist-head-row">
              <span className="c2-hist-head-content">{content}</span>
              <IconChevronDown size={16} className="c2-hist-chevron" aria-hidden />
            </span>
          </UnstyledButton>
        ) : (
          <div className="c2-hist-head-row">
            <span className="c2-hist-head-content">{content}</span>
          </div>
        )}
        {expandable ? (
          <Collapse
            expanded={open}
            id={regionId}
            transitionDuration={motion.duration.popover}
            transitionTimingFunction={motion.easing.out}
            keepMounted={false}
          >
            <Box mt="xs">
              <FormattedAuditDetails details={details} />
            </Box>
          </Collapse>
        ) : null}
      </div>
    </li>
  );
}
