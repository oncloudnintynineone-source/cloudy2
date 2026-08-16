import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
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
    phone: text("phone").notNull(),
    email: text("email"),
    birthday: date("birthday"),
    role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
    passwordHash: text("password_hash"),
    status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_phone_idx").on(table.phone),
    index("users_role_idx").on(table.role),
  ],
);

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("departments_name_idx").on(table.name)],
);

export const userDepartments = pgTable(
  "user_departments",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.departmentId] }),
    index("user_departments_department_idx").on(table.departmentId),
  ],
);

export const calendars = pgTable(
  "calendars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    googleCalendarId: text("google_calendar_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["department", "shared"] }).notNull().default("department"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("calendars_google_calendar_id_idx").on(table.googleCalendarId),
    index("calendars_department_idx").on(table.departmentId),
  ],
);

export const acronyms = pgTable("acronyms", {
  id: uuid("id").primaryKey().defaultRandom(),
  acronym: text("acronym").notNull(),
  meaning: text("meaning").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

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
    kahPercentage: integer("kah_percentage").notNull().default(100),
    kahNotificationEmails: text("kah_notification_emails").array().notNull().default(sql`'{}'::text[]`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("settings_singleton", sql`${table.id} = 'singleton'`)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type Calendar = typeof calendars.$inferSelect;
export type NewCalendar = typeof calendars.$inferInsert;
export type Acronym = typeof acronyms.$inferSelect;
export type ParadeState = typeof paradeStates.$inferSelect;
export type Settings = typeof settings.$inferSelect;
