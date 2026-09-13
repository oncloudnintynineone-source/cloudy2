/**
 * Pure builder for the daily parade-state email. Renders the full roster
 * (department tree, per-person in-camp / out-of-camp status) into the
 * `{departments}` block, then substitutes the admin-editable subject/body
 * templates. Kept free of I/O so it can be unit-tested without a database.
 */

import dayjs from "dayjs";

import { formatInstantToNaive } from "@/lib/events/datetime";
import { renderTemplate } from "@/lib/email/template";
import { formatEventTimeBadge } from "@/lib/parade/eventTimeBadge";
import { formatFullName } from "@/lib/settings/formatName";

import {
  PARADE_EMAIL_BODY_TEMPLATE_DEFAULT,
  PARADE_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
} from "./emailDefaults";

export interface ParadeEmailUser {
  id: string;
  name: string;
  departmentName: string | null;
}

export interface ParadeEmailSection {
  name: string;
  users: readonly ParadeEmailUser[];
  children: readonly ParadeEmailSection[];
}

export interface ParadeEmailEvent {
  title: string;
  eventType: string | null;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
}

export interface ParadeEmailReportInput {
  /** Snapshot date (`YYYY-MM-DD`, UTC+8). */
  date: string;
  nameTemplate: string;
  sections: readonly ParadeEmailSection[];
  /** Out-of-camp events per user; a missing/empty entry means in camp. */
  eventsByUser: ReadonlyMap<string, readonly ParadeEmailEvent[]>;
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
  /** Instant the report is generated at (for `{generatedAt}`). */
  now?: Date;
}

export interface ParadeEmailReport {
  subject: string;
  body: string;
  present: number;
  total: number;
  outOfCamp: number;
}

/** The token values a parade-state email template can use, pre-rendered. */
export type ParadeTemplateContext = {
  date: string;
  weekday: string;
  present: string;
  total: string;
  outofcamp: string;
  generatedat: string;
  departments: string;
};

function aggregate(
  section: ParadeEmailSection,
  isPresent: (userId: string) => boolean,
): { present: number; total: number } {
  let present = 0;
  let total = 0;
  for (const user of section.users) {
    total += 1;
    if (isPresent(user.id)) present += 1;
  }
  for (const child of section.children) {
    const sub = aggregate(child, isPresent);
    total += sub.total;
    present += sub.present;
  }
  return { present, total };
}

function eventSummary(event: ParadeEmailEvent, date: string): string {
  const label = event.eventType?.trim() || event.title.trim() || "Event";
  const time = formatEventTimeBadge(event, date);
  const location = event.location.trim();
  return location ? `${label} (${location}, ${time})` : `${label} (${time})`;
}

/**
 * Render the `{departments}` block: flat blocks in tree order (a department,
 * then its sub-departments depth-first), skipping subtrees with no users so the
 * email mirrors the parade page. A block header's count covers its whole
 * subtree; its lines list only its direct users.
 */
function renderDepartments(
  sections: readonly ParadeEmailSection[],
  isPresent: (userId: string) => boolean,
  eventsByUser: ReadonlyMap<string, readonly ParadeEmailEvent[]>,
  nameTemplate: string,
  date: string,
): string {
  const blocks: string[] = [];

  const visit = (section: ParadeEmailSection) => {
    const counts = aggregate(section, isPresent);
    if (counts.total === 0) return;

    if (section.users.length > 0) {
      const lines = section.users.map((user) => {
        const display = formatFullName(
          { name: user.name, departmentName: user.departmentName },
          nameTemplate,
        );
        const events = eventsByUser.get(user.id) ?? [];
        if (events.length === 0) {
          return `${display} — Present`;
        }
        const details = events.map((event) => eventSummary(event, date)).join("; ");
        return `${display} — Out of camp: ${details}`;
      });
      blocks.push([`${section.name} (${counts.present} of ${counts.total} present)`, ...lines].join("\n"));
    }

    for (const child of section.children) {
      visit(child);
    }
  };

  for (const section of sections) {
    visit(section);
  }
  return blocks.join("\n\n");
}

/** Sample context for the Settings live preview (deterministic). */
export const PARADE_EMAIL_SAMPLE_CONTEXT: ParadeTemplateContext = {
  date: "2026-09-13",
  weekday: "Sunday",
  present: "3",
  total: "5",
  outofcamp: "2",
  generatedat: "2026-09-13 07:00:00",
  departments: [
    "HQ (2 of 3 present)",
    "Alice Tan — Present",
    "Bob Ng — Out of camp: Overseas course (SITE, Aug 19 – Aug 21)",
    "Charlie Lim — Present",
    "",
    "Logistics (1 of 2 present)",
    "Dana Wong — Out of camp: Medical leave (Aug 20, 8:00 AM – 12:00 PM)",
    "Eve Lee — Present",
  ].join("\n"),
};

/**
 * Build the daily parade-state email from the admin's templates, falling back
 * to the built-in defaults when a template is blank so a cleared settings field
 * never produces an empty email.
 */
export function buildParadeStateEmail(input: ParadeEmailReportInput): ParadeEmailReport {
  const isPresent = (userId: string) => (input.eventsByUser.get(userId)?.length ?? 0) === 0;

  let total = 0;
  let present = 0;
  for (const section of input.sections) {
    const counts = aggregate(section, isPresent);
    total += counts.total;
    present += counts.present;
  }
  const outOfCamp = total - present;

  const now = input.now ?? new Date();
  const context: ParadeTemplateContext = {
    date: input.date,
    weekday: dayjs(input.date).format("dddd"),
    present: String(present),
    total: String(total),
    outofcamp: String(outOfCamp),
    generatedat: formatInstantToNaive(now),
    departments: renderDepartments(
      input.sections,
      isPresent,
      input.eventsByUser,
      input.nameTemplate,
      input.date,
    ),
  };

  const subjectTemplate = input.subjectTemplate?.trim() || PARADE_EMAIL_SUBJECT_TEMPLATE_DEFAULT;
  const bodyTemplate = input.bodyTemplate?.trim() || PARADE_EMAIL_BODY_TEMPLATE_DEFAULT;

  return {
    subject: renderTemplate(subjectTemplate, context),
    body: renderTemplate(bodyTemplate, context),
    present,
    total,
    outOfCamp,
  };
}
