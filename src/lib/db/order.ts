/**
 * Shared display orders for the reference tables. The same ordering is used by
 * the roster queries, the dashboard config read, and the admin reorder/move
 * actions — keeping it here prevents one copy from drifting.
 */

import { asc } from "drizzle-orm";

import { calendars, eventTypeGroups } from "@/db/schema";

/** Departments in tree preorder (globally unique `sortOrder`), name as tie-break. */
export const DEPARTMENT_ORDER = [asc(calendars.sortOrder), asc(calendars.name)] as const;

/** Event-type groups in display order, name as tie-break. */
export const EVENT_TYPE_GROUP_ORDER = [
  asc(eventTypeGroups.sortOrder),
  asc(eventTypeGroups.name),
] as const;
