import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    shortname: text("shortname"),
    phone: text("phone").notNull(),
    email: text("email"),
    birthday: date("birthday"),
    role: text("role", { enum: ["admin", "user"] })
      .notNull()
      .default("user"),
    passwordHash: text("password_hash"),
    status: text("status", { enum: ["active", "inactive"] })
      .notNull()
      .default("active"),
    departmentId: uuid("department_id").references(() => calendars.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_phone_idx").on(table.phone),
    uniqueIndex("users_shortname_idx").on(table.shortname),
    index("users_role_idx").on(table.role),
    index("users_department_idx").on(table.departmentId),
  ],
);

export const calendars = pgTable(
  "calendars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleCalendarId: text("google_calendar_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["department", "shared"] })
      .notNull()
      .default("department"),
    ...timestamps,
  },
  (table) => [uniqueIndex("calendars_google_calendar_id_idx").on(table.googleCalendarId)],
);

export const acronyms = pgTable("acronyms", {
  id: uuid("id").primaryKey().defaultRandom(),
  acronym: text("acronym").notNull(),
  meaning: text("meaning").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const eventTypes = pgTable(
  "event_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    shortname: text("shortname"),
    /** Selectable datetime options ("range" | "full"); empty = default range. */
    timeOptions: text("time_options")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * Where events of this type may take place: "in" (in camp only, no Out of
     * Camp flag), "out" (out of camp only, no location), "both" (no
     * restriction — the default).
     */
    locationPolicy: text("location_policy").notNull().default("both"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("event_types_name_idx").on(table.name),
    uniqueIndex("event_types_shortname_idx").on(table.shortname),
  ],
);

export const paradeStates = pgTable("parade_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const settings = pgTable(
  "settings",
  {
    id: text("id").primaryKey().default("singleton"),
    adminPasswordHash: text("admin_password_hash"),
    userKeyword: text("user_keyword"),
    nameTemplate: text("name_template").notNull().default("{name}"),
    eventTitleTemplate: text("event_title_template").notNull().default("{description}"),
    kahPercentage: integer("kah_percentage").notNull().default(100),
    kahNotificationEmails: text("kah_notification_emails")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** How many days of audit_logs to keep; older rows are purged on read. */
    auditLogRetentionDays: integer("audit_log_retention_days").notNull().default(90),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("settings_singleton", sql`${table.id} = 'singleton'`)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    entityName: text("entity_name"),
    route: text("route"),
    method: text("method"),
    details: jsonb("details"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_actor_idx").on(table.actorId),
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_created_idx").on(table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

/**
 * Server-side cache of one department calendar's month of events, keyed by the
 * Google calendar id + `YYYY-MM`. `events` holds `GcalEventItem`s with dates
 * encoded as ISO strings (see `src/lib/google/eventsCacheCodec.ts`). Kept in
 * Postgres so it is shared across serverless instances and survives restarts;
 * entries are TTL'd on read (fresh 30s → stale-while-revalidate → expire 30min)
 * and invalidated by in-app mutations via `invalidateGcalCache()`.
 */
export const googleEventCache = pgTable(
  "google_event_cache",
  {
    calendarGoogleId: text("calendar_google_id").notNull(),
    month: text("month").notNull(),
    events: jsonb("events").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.calendarGoogleId, table.month] })],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Calendar = typeof calendars.$inferSelect;
export type NewCalendar = typeof calendars.$inferInsert;
export type Acronym = typeof acronyms.$inferSelect;
export type EventType = typeof eventTypes.$inferSelect;
export type ParadeState = typeof paradeStates.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type GoogleEventCache = typeof googleEventCache.$inferSelect;
export type NewGoogleEventCache = typeof googleEventCache.$inferInsert;
