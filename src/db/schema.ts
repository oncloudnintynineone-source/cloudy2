import { sql } from "drizzle-orm";
import {
  bigint,
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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT } from "@/lib/events/participantNotify/templates";
import {
  PARADE_EMAIL_BODY_TEMPLATE_DEFAULT,
  PARADE_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
} from "@/lib/parade-email/emailDefaults";

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
    /**
     * Fallback color for untyped/external events (Mantine palette name);
     * null = deterministic default from the calendar id.
     */
    color: text("color"),
    /**
     * Parent department (self FK); null = top level. Deleting a parent
     * promotes its children to top level. `sortOrder` is globally unique
     * and encodes preorder tree rank (children ranked right after their
     * parent), so the flat ordering doubles as the tree rendering order.
     */
    parentId: uuid("parent_id").references((): AnyPgColumn => calendars.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("calendars_google_calendar_id_idx").on(table.googleCalendarId),
    index("calendars_sort_idx").on(table.sortOrder),
    index("calendars_parent_idx").on(table.parentId),
  ],
);

/**
 * Cross-department calendar grants: a roster user given access to a department
 * calendar *other than* their own (`users.department_id`). Each row is the
 * app-level intent behind one Google Calendar ACL rule (granted at `role`, which
 * is one of the managed levels "reader" | "writer" | "owner"). The user's own
 * department is never represented here — it is implied by `users.department_id`
 * and reconciled the usual way (an elevated own-department role is a raw ACL
 * override, managed from the department modal or the user form). Rows survive
 * email changes (the reconcile paths re-grant the new email), deactivation (like
 * the reader rules of assigned users), and cascade when the user or the
 * department calendar is deleted.
 */
export const userCalendarAccess = pgTable(
  "user_calendar_access",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    /** The managed ACL level to (re)grant: "reader" | "writer" | "owner". */
    role: text("role", { enum: ["reader", "writer", "owner"] })
      .notNull()
      .default("reader"),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.calendarId] }),
    index("user_calendar_access_calendar_idx").on(table.calendarId),
  ],
);

/**
 * A user's on-demand dashboard calendar view (tab). Each row is one tab the
 * user created: a renderer kind (`month` | `week` | `weekv2` | `weekgrid` |
 * `schedule` | `agenda` | `dual`), a user-chosen
 * display `name`, a per-user `sortOrder` for the tab strip, and the tab's own
 * filter overrides. Duplicates of the same kind are allowed (two Agenda tabs
 * with different names/filters); the tab's UUID is its identity, carried in
 * the URL as `?view=<id>`.
 *
 * Filter semantics: each of `calFilter`/`usersFilter`/`typesFilter` is a JSON
 * array of selected calendar ids / roster user ids / event-type *names*, or
 * SQL NULL meaning "role default" (admin: all calendars; non-admin: their own
 * department) — an explicit `[]` is a genuine empty selection, distinct from
 * NULL. Values are re-validated against live data on every dashboard read
 * (stale ids drop out), exactly like the URL params they replaced.
 */
export const userDashboardViews = pgTable(
  "user_dashboard_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewType: text("view_type").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    calFilter: jsonb("cal_filter"),
    usersFilter: jsonb("users_filter"),
    typesFilter: jsonb("types_filter"),
    ...timestamps,
  },
  (table) => [index("user_dashboard_views_user_sort_idx").on(table.userId, table.sortOrder)],
);

/**
 * Per-user application preferences stored server-side so they follow the
 * account across devices: the Parade State Calendars/Users filters and the
 * event-search history. Lazily ensured on first read.
 * Device-local preferences (sidebar rail state, Day/Week (H) zoom, the
 * dashboard date/month anchor, last visited page) deliberately stay in the
 * `cloudy2.ui` cookie — see docs/ui-state.md.
 */
export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Parade State Calendars filter — an explicit list (empty = all). */
    paradeCal: jsonb("parade_cal")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Parade State Users filter — an explicit list (empty = no user filter). */
    paradeUsers: jsonb("parade_users")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * The user's recent event-search queries, most-recent-first (a bounded,
     * deduped string list — see `src/lib/events/searchHistory.ts`). Empty = no
     * history. Stored server-side so the shortcuts follow the account across
     * devices.
     */
    searchHistory: jsonb("search_history")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * The per-profile master switch for event participant push
     * notifications ("notify me when I'm added to an event"). Independent of
     * the OS/browser permission: when false, no push is sent even for a
     * subscribed device. Defaults to true; only meaningful once a device is
     * actually subscribed.
     */
    eventInvitePush: boolean("event_invite_push").notNull().default(true),
    ...timestamps,
  },
);

/**
 * A browser's Web Push subscription, owned by the roster account whose device
 * it is. One row per push endpoint (a device/browser pair); a user on several
 * devices has several rows, and a device shared by two accounts has its row
 * re-`userId`d to the currently signed-in account on every sync. `keys` holds
 * the subscription's `{ p256dh, auth }` secrets needed to send to it.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The push service endpoint; the row's identity (unique per device). */
    endpoint: text("endpoint").notNull(),
    /** The subscription's `{ p256dh, auth }` keys (JSONB). */
    keys: jsonb("keys").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_idx").on(table.endpoint),
    index("push_subscriptions_user_idx").on(table.userId),
  ],
);

export const acronyms = pgTable("acronyms", {
  id: uuid("id").primaryKey().defaultRandom(),
  acronym: text("acronym").notNull(),
  meaning: text("meaning").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const eventTypeGroups = pgTable(
  "event_type_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Display rank in the event form's grouped type picker. */
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("event_type_groups_name_idx").on(table.name),
    index("event_type_groups_sort_idx").on(table.sortOrder),
  ],
);

export const eventTypes = pgTable(
  "event_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    shortname: text("shortname"),
    /**
     * Display group for the event form's type picker; null = ungrouped
     * (rendered in a trailing "Ungrouped" section). Deleting a group leaves
     * its types ungrouped.
     */
    groupId: uuid("group_id").references((): AnyPgColumn => eventTypeGroups.id, {
      onDelete: "set null",
    }),
    /** Selectable datetime options ("range" | "full"); empty = default range. */
    timeOptions: text("time_options")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * The location categories events of this type may take place in
     * ("in" camp | "out" of camp in country | "overseas"). Empty/missing
     * falls back to all three. An event's category is a single value; this
     * matrix is the per-type allowlist.
     */
    allowedLocations: text("allowed_locations")
      .array()
      .notNull()
      .default(sql`'{in,out,overseas}'::text[]`),
    /** Whether the event form shows the Remarks (description) step for this type. */
    showRemarks: boolean("show_remarks").notNull().default(true),
    /** Whether the event form shows the Participants step for this type. */
    showInvitees: boolean("show_invitees").notNull().default(true),
    /**
     * Whether the wizard shows the Location step for this type. When off, the
     * step is skipped entirely and events save in the type's sole allowed
     * location category with no specific place — only meaningful when
     * {@link allowedLocations} has exactly one entry (enforced in the
     * event-type form and validation).
     */
    showLocation: boolean("show_location").notNull().default(true),
    /**
     * Whether events of this type are informational and therefore excluded
     * from clash (double-booking) checks — they never trigger a conflict and
     * are never checked themselves.
     */
    excludeFromClash: boolean("exclude_from_clash").notNull().default(false),
    /** Admin-set event color (Mantine palette name); null = deterministic default from the name. */
    color: text("color"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("event_types_name_idx").on(table.name),
    uniqueIndex("event_types_shortname_idx").on(table.shortname),
    index("event_types_group_idx").on(table.groupId),
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

export const eventTitleTemplates = pgTable("event_title_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  /** DEPRECATED free-text template (kept for rollback); recipes live in `recipe`. */
  template: text("template").notNull().default(""),
  /** The structured title recipe (ordered fields + decoration). */
  recipe: jsonb("recipe")
    .notNull()
    .default(sql`'{"segments":[{"field":"description"}]}'::jsonb`),
  ...timestamps,
});

export const settings = pgTable(
  "settings",
  {
    id: text("id").primaryKey().default("singleton"),
    adminPasswordHash: text("admin_password_hash"),
    /**
     * Shared admin sign-in PIN for `role='admin'` users, seeded/reconciled from
     * the `ADMIN_PIN` env var only — never managed in-app, never exposed by
     * `getSettings`. Kept separate from `admin_password_hash` (the phone-less
     * break-glass root secret) so the two env secrets rotate independently.
     */
    adminPinHash: text("admin_pin_hash"),
    userKeyword: text("user_keyword"),
    nameTemplate: text("name_template").notNull().default("{name}"),
    /** DEPRECATED free-text template (kept for rollback); recipes live in `event_title_recipe`. */
    eventTitleTemplate: text("event_title_template").notNull().default("{description}"),
    /** Structured master event-title recipe (ordered fields + decoration). */
    eventTitleRecipe: jsonb("event_title_recipe")
      .notNull()
      .default(sql`'{"segments":[{"field":"description"}]}'::jsonb`),
    eventTitleTemplateAssignments: jsonb("event_title_template_assignments")
      .notNull()
      .default(sql`'{}'::jsonb`),
    /**
     * Default required in-country percentage prefilled when a new KAH group
     * is created (the live thresholds live on each `kah_groups` row).
     */
    kahPercentage: integer("kah_percentage").notNull().default(100),
    /** Addresses notified when an event pushes a KAH group below its threshold. */
    kahNotificationEmails: text("kah_notification_emails")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * Admin-customized KAH breach email templates ({event} {actor} {window}
     * {breaches}); the defaults are the shipped wording — keep in sync with
     * `src/lib/kah/emailDefaults.ts`, which shares these exact strings.
     */
    kahEmailSubjectTemplate: text("kah_email_subject_template")
      .notNull()
      .default("[cloudy2] KAH limit exceeded — {event}"),
    kahEmailBodyTemplate: text("kah_email_body_template")
      .notNull()
      .default(
        'Key Appointment Holder limit exceeded.\n\nAfter "{event}" was saved by {actor}, ' +
          "the following groups are below\ntheir required in-country percentage for the " +
          "affected period:\n\n{breaches}\n\nEvent window: {window}\n\nThis is a notification " +
          "only — the event was saved. Adjust the event or\nthe KAH groups in Settings if " +
          "this was not intended.",
      ),
    /**
     * Admin-customized participant-notification content templates (title/body
     * per reason, rendered with `{title}` `{type}` `{time}` `{location}` and
     * `< ... >` conditional groups). Defaults are the shipped wording — keep in
     * sync with `src/lib/events/participantNotify/templates.ts`, whose
     * constants are the runtime fallback for blank/absent fields (these column
     * defaults only seed new rows).
     */
    participantNotifyCreatedTitle: text("participant_notify_created_title")
      .notNull()
      .default(PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT.createdTitle),
    participantNotifyCreatedBody: text("participant_notify_created_body")
      .notNull()
      .default(PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT.createdBody),
    participantNotifyAddedTitle: text("participant_notify_added_title")
      .notNull()
      .default(PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT.addedTitle),
    participantNotifyAddedBody: text("participant_notify_added_body")
      .notNull()
      .default(PARTICIPANT_NOTIFY_TEMPLATES_DEFAULT.addedBody),
    /** How many days of audit_logs to keep; older rows are purged on read. */
    auditLogRetentionDays: integer("audit_log_retention_days").notNull().default(90),
    /**
     * Announcement banner shown above the app header for all signed-in users
     * (Settings → Banner). `banner_color` is a key of the curated BANNER_COLORS
     * list (`src/lib/banner/banner.ts`); null = the default entry.
     */
    bannerEnabled: boolean("banner_enabled").notNull().default(false),
    bannerText: text("banner_text").notNull().default(""),
    bannerColor: text("banner_color"),
    /**
     * Daily parade-state email (Settings → Parade State Email): when enabled,
     * the selected roster users receive one snapshot on each weekday at 08:00
     * Singapore time, scheduled by Cloud Scheduler. Recipients are stored as
     * user ids so their addresses follow roster changes. Subject/body are
     * admin-editable templates with `{date}`/`{present}`/`{departments}` tokens
     * — defaults in `src/lib/parade-email/emailDefaults.ts`, kept in sync with
     * these columns.
     */
    paradeEmailEnabled: boolean("parade_email_enabled").notNull().default(false),
    paradeEmailRecipientIds: jsonb("parade_email_recipient_ids")
      .notNull()
      .default(sql`'[]'::jsonb`),
    paradeEmailSubjectTemplate: text("parade_email_subject_template")
      .notNull()
      .default(PARADE_EMAIL_SUBJECT_TEMPLATE_DEFAULT),
    paradeEmailBodyTemplate: text("parade_email_body_template")
      .notNull()
      .default(PARADE_EMAIL_BODY_TEMPLATE_DEFAULT),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("settings_singleton", sql`${table.id} = 'singleton'`)],
);

/**
 * Single-row monotonic epoch guarding the Google event month cache against
 * stale-refresh resurrection. `invalidateGcalCache` / `purgeGcalCache` bump it;
 * a background `refreshMonthEvents` snapshots it before its Google fetch and
 * skips the DB/L1 upsert when it advanced mid-flight (an invalidation ran on
 * another instance while the fetch was in the air). See docs/events-cache.md.
 */
export const cacheInvalidation = pgTable(
  "cache_invalidation",
  {
    id: text("id").primaryKey().default("singleton"),
    epoch: bigint("epoch", { mode: "number" }).notNull().default(0),
    ...timestamps,
  },
  (table) => [check("cache_invalidation_singleton", sql`${table.id} = 'singleton'`)],
);

/**
 * Registered outbound webhook endpoints notified of event create/update/delete.
 * Every enabled row receives every event action; `secret` is optional (an
 * endpoint without one receives unsigned deliveries).
 */
export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  secret: text("secret"),
  enabled: boolean("enabled").notNull().default(true),
  ...timestamps,
});

/**
 * Admin-managed quick links shown in the dashboard's quick-links menu
 * (launched by the amber `IconLink` FAB on mobile / the nav-row chip at lg).
 * The menu lists `enabled` rows in `sortOrder` order; the launcher only
 * appears when at least one row is enabled. `icon` is a key into the curated
 * tabler icon set (see `src/lib/quickLinks/icons.ts`); `color` (Mantine
 * palette name) tints the menu item's icon.
 */
export const quickLinks = pgTable(
  "quick_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    icon: text("icon").notNull().default("external-link"),
    color: text("color"),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [index("quick_links_sort_idx").on(table.sortOrder)],
);

/**
 * Key Appointment Holder (KAH) groups: named sets of important users with a
 * required percentage of members that must remain in-country. When an event
 * is created or updated, each group's members tagged on events overlapping
 * the event's window count as away; a group whose in-country share drops
 * below `minPercentage` triggers a notification email (see
 * `src/lib/kah/notify.ts`, design: docs/kah.md).
 */
export const kahGroups = pgTable(
  "kah_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Required in-country share of the group, 1–100. */
    minPercentage: integer("min_percentage").notNull().default(100),
    ...timestamps,
  },
  (table) => [uniqueIndex("kah_groups_name_idx").on(table.name)],
);

/** Membership join between KAH groups and roster users. */
export const kahGroupMembers = pgTable(
  "kah_group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => kahGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("kah_group_members_user_idx").on(table.userId),
  ],
);

/**
 * Dedup record for KAH breach notifications: one row per (group × window ×
 * breach-pct) that has already been emailed. Prevents duplicate notifications
 * when the same mutation is re-saved or an edit doesn't change the breach
 * state. Rows cascade-delete when the parent group is removed.
 */
export const kahBreachNotifications = pgTable(
  "kah_breach_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => kahGroups.id, { onDelete: "cascade" }),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    /** The floored in-country % at the time of notification (the breach state). */
    breachPct: integer("breach_pct").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("kah_breach_notif_dedup_idx").on(
      table.groupId,
      table.windowStart,
      table.windowEnd,
      table.breachPct,
    ),
  ],
);

/**
 * One row per day the daily parade-state email was processed. The unique
 * `send_date` makes the dispatcher idempotent: a repeated tick on the same day
 * hits the conflict and is skipped, so the email goes out at most once.
 */
export const paradeEmailSends = pgTable(
  "parade_email_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The snapshot's UTC+8 calendar date (`YYYY-MM-DD`). */
    sendDate: date("send_date").notNull(),
    status: text("status", { enum: ["sent", "failed", "skipped"] })
      .notNull()
      .default("sent"),
    recipientCount: integer("recipient_count").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps,
  },
  (table) => [uniqueIndex("parade_email_sends_date_idx").on(table.sendDate)],
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
export type UserCalendarAccess = typeof userCalendarAccess.$inferSelect;
export type NewUserCalendarAccess = typeof userCalendarAccess.$inferInsert;
export type Acronym = typeof acronyms.$inferSelect;
export type EventTypeGroup = typeof eventTypeGroups.$inferSelect;
export type EventType = typeof eventTypes.$inferSelect;
export type ParadeState = typeof paradeStates.$inferSelect;
export type EventTitleTemplate = typeof eventTitleTemplates.$inferSelect;
export type NewEventTitleTemplate = typeof eventTitleTemplates.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type GoogleEventCache = typeof googleEventCache.$inferSelect;
export type NewGoogleEventCache = typeof googleEventCache.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type QuickLink = typeof quickLinks.$inferSelect;
export type NewQuickLink = typeof quickLinks.$inferInsert;
export type KahGroup = typeof kahGroups.$inferSelect;
export type NewKahGroup = typeof kahGroups.$inferInsert;
export type KahGroupMember = typeof kahGroupMembers.$inferSelect;
export type NewKahGroupMember = typeof kahGroupMembers.$inferInsert;
export type KahBreachNotification = typeof kahBreachNotifications.$inferSelect;
export type NewKahBreachNotification = typeof kahBreachNotifications.$inferInsert;
export type ParadeEmailSend = typeof paradeEmailSends.$inferSelect;
export type NewParadeEmailSend = typeof paradeEmailSends.$inferInsert;
export type UserDashboardView = typeof userDashboardViews.$inferSelect;
export type NewUserDashboardView = typeof userDashboardViews.$inferInsert;
export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
